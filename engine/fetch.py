"""Yahoo Finance access via yfinance: retries, a shared rate-limit brake, and
currency normalization.

Guarantee to the rest of the engine: every money field in a snapshot is in the
stock's *quote* currency (what the share price is in). Foreign filers report in
their home currency (an ADR quoted in USD may report in CNY), so snapshot()
converts at the latest FX rate and records the conversion in info["_fx"].

Everything that touches Yahoo lives here, so swapping data vendors later
means rewriting this one module.
"""
import itertools
import logging
import queue
import random
import threading
import time

import pandas as pd
import yfinance as yf

from .metrics import clean

log = logging.getLogger(__name__)


class NotFound(Exception):
    """Yahoo has no quote for this symbol (delisted, renamed, or not covered)."""


class OutOfTime(Exception):
    """The run's time budget ran out before this request started."""


# ─── Shared rate-limit brake ──────────────────────────────────────────────────
# When any thread gets throttled, every thread pauses; repeated hits back off harder.
_lock = threading.Lock()
_pause_until = 0.0
_strikes = 0


def _wait_turn(deadline: float | None = None) -> None:
    while True:
        with _lock:
            wait = _pause_until - time.monotonic()
        if deadline and time.monotonic() > deadline:
            raise OutOfTime()
        if wait <= 0:
            return
        time.sleep(min(wait, 5))


def _throttled(exc: Exception) -> bool:
    s = f"{type(exc).__name__} {exc}"
    return any(x in s for x in ("RateLimit", "429", "Too Many Requests", "Invalid Crumb", "401"))


def _hit_rate_limit() -> None:
    global _pause_until, _strikes
    with _lock:
        if _pause_until > time.monotonic():
            return  # another thread already applied the brake
        _strikes += 1
        pause = min(300, 20 * 2 ** min(_strikes - 1, 4))
        _pause_until = time.monotonic() + pause
    log.info("  Yahoo rate limit hit; pausing all requests for %ds", pause)


def _call(fn, attempts: int = 4, deadline: float | None = None):
    global _strikes
    for attempt in range(attempts):
        _wait_turn(deadline)
        try:
            result = fn()
            with _lock:
                _strikes = max(0, _strikes - 1)
            return result
        except Exception as exc:
            if "404" in str(exc) or "not found" in str(exc).lower():
                raise NotFound(str(exc)) from exc
            if attempt == attempts - 1:
                raise
            if _throttled(exc):
                _hit_rate_limit()
            else:
                time.sleep(1.5 * 2 ** attempt + random.random())


# ─── Currency ─────────────────────────────────────────────────────────────────
_fx_cache: dict[tuple[str, str], float | None] = {}
MONEY_FIELDS = ("totalRevenue", "ebitda", "freeCashflow", "operatingCashflow", "totalDebt", "totalCash",
                "grossProfits", "netIncomeToCommon")


def fx(src: str, dst: str) -> float | None:
    """Units of `dst` per 1 `src` (e.g. fx('CNY', 'USD') ~ 0.14)."""
    if src == dst:
        return 1.0
    key = (src, dst)
    if key not in _fx_cache:
        try:
            hist = _call(lambda: yf.Ticker(f"{src}{dst}=X").history(period="5d"), attempts=3)
            _fx_cache[key] = float(hist["Close"].dropna().iloc[-1])
        except Exception as exc:
            log.warning("No FX rate for %s->%s: %s", src, dst, exc)
            _fx_cache[key] = None
    return _fx_cache[key]


def localize(info: dict) -> dict:
    """Convert financial-currency fields to the quote currency and rebuild the
    multiples that mix the two (EV, EV/EBITDA, P/S...)."""
    src, dst = info.get("financialCurrency"), info.get("currency")
    if not src or not dst or src == dst:
        return {**info, "_fx": None}
    rate = fx(src, dst)
    out = {**info, "_fx": {"from": src, "to": dst, "rate": rate}}
    # Book value per share is per *ordinary* share in the home currency, and the
    # ADR ratio isn't published, so P/B can't be made comparable. Drop it.
    out["bookValue"] = out["priceToBook"] = None
    if rate is None:
        for k in (*MONEY_FIELDS, "enterpriseValue", "enterpriseToEbitda", "enterpriseToRevenue",
                  "priceToSalesTrailing12Months"):
            out[k] = None
        return out
    for k in MONEY_FIELDS:
        if clean(out.get(k)) is not None:
            out[k] = clean(out[k]) * rate
    mcap, debt, cash = clean(out.get("marketCap")), clean(out.get("totalDebt")), clean(out.get("totalCash"))
    rev, ebitda = clean(out.get("totalRevenue")), clean(out.get("ebitda"))
    ev = mcap + (debt or 0) - (cash or 0) if mcap else None
    out["enterpriseValue"] = ev
    out["enterpriseToEbitda"] = ev / ebitda if ev and ebitda and ebitda > 0 else None
    out["enterpriseToRevenue"] = ev / rev if ev and rev else None
    out["priceToSalesTrailing12Months"] = mcap / rev if mcap and rev else None
    return out


def localize_frame(df, fx_info: dict | None, cols=("avg", "low", "high", "yearAgoRevenue", "yearAgoEps")):
    """Convert an estimates table reported in the home currency."""
    if df is None or not fx_info or not fx_info.get("rate") or not isinstance(df, pd.DataFrame) or df.empty:
        return df
    df = df.copy()
    if "currency" in df.columns:
        mask = df["currency"] == fx_info["from"]
        for c in cols:
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
                df.loc[mask, c] = df.loc[mask, c] * fx_info["rate"]
        df.loc[mask, "currency"] = fx_info["to"]
    return df


# ─── Snapshots ────────────────────────────────────────────────────────────────

def snapshot(ticker: str, deadline: float | None = None) -> dict:
    """Quote, profile, and trailing fundamentals in one request (quote currency)."""
    info = _call(lambda: yf.Ticker(ticker).info, deadline=deadline)
    if not info or (info.get("regularMarketPrice") is None and info.get("currentPrice") is None):
        raise NotFound(f"no quote data for {ticker}")
    return localize(info)


def snapshots(tickers: list[str], workers: int = 4, deadline: float | None = None):
    """Fetch snapshots concurrently, returning (infos, failed, not_fetched).

    Worker threads are daemons and the join has a timeout, so a request stuck
    inside yfinance can never hold the whole run past `deadline`.
    """
    pending = queue.Queue()
    for t in tickers:
        pending.put(t)
    out, failed, missing = {}, [], []
    lock = threading.Lock()
    done = itertools.count(1)

    def work():
        while True:
            try:
                ticker = pending.get_nowait()
            except queue.Empty:
                return
            if deadline and time.monotonic() > deadline:
                return
            try:
                info = snapshot(ticker, deadline)
            except NotFound:
                with lock:
                    missing.append(ticker)
            except OutOfTime:
                return
            except Exception as exc:
                log.debug("snapshot failed for %s: %s", ticker, exc)
                with lock:
                    failed.append(ticker)
            else:
                with lock:
                    out[ticker] = info
            n = next(done)
            if n % 100 == 0:
                log.info("  snapshots: %d/%d (%d ok)", n, len(tickers), len(out))

    threads = [threading.Thread(target=work, daemon=True, name=f"snap{i}") for i in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=max(1.0, deadline - time.monotonic()) if deadline else None)

    with lock:
        fetched = set(out) | set(missing) | set(failed)
        not_fetched = [t for t in tickers if t not in fetched]
        if missing:
            log.info("  %d symbols have no Yahoo quote (delisted/renamed)", len(missing))
        if failed:
            log.warning("  %d snapshots failed: %s", len(failed), ", ".join(sorted(failed)[:20]))
        if not_fetched:
            log.warning("  %d snapshots not reached before the deadline", len(not_fetched))
        return dict(out), list(failed), not_fetched


# ─── Deep-dive data ───────────────────────────────────────────────────────────

def statements(ticker: str) -> dict:
    """Annual statements and 5y weekly prices (required), plus estimates,
    holders, and news (best effort: small caps often lack them).
    Statement values are in the *financial* currency; normalize() converts."""
    t = yf.Ticker(ticker)
    out = {
        "income": _call(lambda: t.income_stmt),
        "balance": _call(lambda: t.balance_sheet),
        "cashflow": _call(lambda: t.cashflow),
        "history": _call(lambda: t.history(period="5y", interval="1wk", auto_adjust=True)),
    }
    for key, getter in (("revenue_estimate", lambda: t.revenue_estimate),
                        ("earnings_estimate", lambda: t.earnings_estimate),
                        ("institutional_holders", lambda: t.institutional_holders),
                        ("major_holders", lambda: t.major_holders),
                        ("news", lambda: t.get_news(count=20))):
        try:
            out[key] = _call(getter, attempts=2)
        except Exception as exc:
            log.debug("%s %s unavailable: %s", ticker, key, exc)
            out[key] = None
    return out


def risk_free_rate(fallback: float) -> float:
    """Latest 10-year Treasury yield (^TNX quotes it in percent)."""
    try:
        hist = _call(lambda: yf.Ticker("^TNX").history(period="5d"), attempts=2)
        rate = float(hist["Close"].dropna().iloc[-1]) / 100
        if 0.001 < rate < 0.15:
            return rate
    except Exception as exc:
        log.warning("Risk-free fetch failed (%s); using fallback %.2f%%", exc, fallback * 100)
    return fallback
