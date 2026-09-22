"""Market alerts to Telegram: a morning brief and breaking moves during the day.

    python -m engine.alerts brief       # once each weekday morning
    python -m engine.alerts breaking    # every 30 min while the market is open
    python -m engine.alerts test        # prove the bot is wired up

Credentials come from the environment (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID),
which GitHub Actions fills from repository secrets. Nothing is stored in the repo.

Breaking alerts remember what they already sent in cache/alerts_state.json so the
same headline or mover never pings twice in a day.
"""
import argparse
import json
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone

import requests
import yfinance as yf

from .config import CACHE_DIR, SITE_DATA
from .metrics import clean
from .news import aliases

log = logging.getLogger("alerts")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
STATE_FILE = CACHE_DIR / "alerts_state.json"

# Index / rates / commodities worth a line in the morning.
MARKET_BAR = [("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"), ("^VIX", "VIX"),
              ("^TNX", "10Y yield"), ("CL=F", "Crude"), ("GC=F", "Gold")]

# A move this big in an S&P 500 name is worth interrupting someone for.
MOVE_THRESHOLD = 0.05
# Headlines about the whole market, not one company.
MACRO_PATTERN = re.compile(
    r"\b(fed|fomc|powell|rate cut|rate hike|inflation|cpi|ppi|jobs report|payrolls|unemployment|"
    r"recession|gdp|tariff|shutdown|debt ceiling|yield curve|treasury yields|oil prices|opec)\b", re.I)


# ─── Telegram ─────────────────────────────────────────────────────────────────

def send(text: str, silent: bool = False) -> bool:
    """Post one message. Returns False (without raising) if the bot isn't configured."""
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        log.warning("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set; skipping send")
        return False
    resp = requests.post(TELEGRAM_API.format(token=token), timeout=30, json={
        "chat_id": chat, "text": text, "parse_mode": "HTML",
        "disable_web_page_preview": True, "disable_notification": silent,
    })
    if not resp.ok:
        log.error("Telegram rejected the message: %s", resp.text[:300])
    return resp.ok


def esc(text) -> str:
    """Telegram HTML needs these three escaped."""
    return str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def site_url() -> str:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner}.github.io/{name}/"
    return ""


# ─── State ────────────────────────────────────────────────────────────────────

def load_state() -> dict:
    today = date.today().isoformat()
    try:
        state = json.loads(STATE_FILE.read_text())
        if state.get("date") == today:
            return state
    except Exception:
        pass
    return {"date": today, "sent": []}


def save_state(state: dict) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    state["sent"] = state["sent"][-400:]
    STATE_FILE.write_text(json.dumps(state))


# ─── Market data ──────────────────────────────────────────────────────────────

def quote_line(symbol: str, label: str) -> str | None:
    try:
        hist = yf.Ticker(symbol).history(period="5d")["Close"].dropna()
        if len(hist) < 2:
            return None
        last, prev = float(hist.iloc[-1]), float(hist.iloc[-2])
        change = last / prev - 1
        arrow = "▲" if change >= 0 else "▼"
        value = f"{last:,.2f}" if symbol not in ("^TNX",) else f"{last:.2f}%"
        return f"{arrow} <b>{esc(label)}</b> {value} ({change * 100:+.1f}%)"
    except Exception as exc:
        log.debug("quote failed for %s: %s", symbol, exc)
        return None


def universe_rows() -> list[dict]:
    try:
        data = json.loads((SITE_DATA / "universe.json").read_text())
        return [dict(zip(data["columns"], r)) for r in data["rows"]]
    except Exception:
        return []


def headlines(symbol: str, since_hours: int, limit: int, macro_only: bool = False) -> list[dict]:
    """Recent stories for a symbol, newest first."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    out = []
    try:
        items = yf.Ticker(symbol).get_news(count=30) or []
    except Exception as exc:
        log.debug("news failed for %s: %s", symbol, exc)
        return []
    for item in items:
        c = item.get("content") or {}
        title, published = c.get("title"), c.get("pubDate")
        if not title or not published:
            continue
        try:
            when = datetime.fromisoformat(published.replace("Z", "+00:00"))
        except ValueError:
            continue
        if when < cutoff or (macro_only and not MACRO_PATTERN.search(title)):
            continue
        out.append({"id": c.get("id") or title, "title": title, "when": when,
                    "url": (c.get("clickThroughUrl") or c.get("canonicalUrl") or {}).get("url", ""),
                    "publisher": (c.get("provider") or {}).get("displayName", "")})
    return sorted(out, key=lambda n: n["when"], reverse=True)[:limit]


# ─── Morning brief ────────────────────────────────────────────────────────────

def morning_brief() -> str:
    rows = universe_rows()
    lines = [f"<b>Market brief · {date.today():%a %b %-d}</b>", ""]

    bar = [line for line in (quote_line(sym, label) for sym, label in MARKET_BAR) if line]
    lines += bar + [""] if bar else []

    earnings_today = sorted(
        (r for r in rows if r.get("earnings") and r["earnings"][:10] == date.today().isoformat()),
        key=lambda r: -(r.get("mcap") or 0))[:8]
    if earnings_today:
        lines.append("<b>Reporting today</b>")
        lines.append(" · ".join(esc(r["ticker"]) for r in earnings_today))
        lines.append("")

    ideas = sorted((r for r in rows if r.get("idea") and (r.get("upside") or 0) > 0),
                   key=lambda r: -r["upside"])[:3]
    if ideas:
        lines.append("<b>Top ideas</b>")
        for r in ideas:
            lines.append(f"{esc(r['ticker'])} <b>+{r['upside'] * 100:.0f}%</b> to fair value "
                         f"· {esc(r['sector'])} · ${r['price']:,.2f}")
        lines.append("")

    news = headlines("^GSPC", since_hours=18, limit=5)
    if news:
        lines.append("<b>Overnight</b>")
        for n in news:
            lines.append(f"• <a href=\"{esc(n['url'])}\">{esc(n['title'])}</a>")
        lines.append("")

    if url := site_url():
        lines.append(f"<a href=\"{esc(url)}\">Open the dashboard →</a>")
    return "\n".join(lines)


# ─── Breaking alerts ──────────────────────────────────────────────────────────

def big_movers(rows: list[dict], threshold: float = MOVE_THRESHOLD) -> list[dict]:
    """S&P 500 names moving hard today, via two bulk screener queries."""
    from yfinance import EquityQuery as Q

    universe = {r["ticker"]: r for r in rows}
    movers = {}
    for direction, op in (("up", "gt"), ("down", "lt")):
        pct = threshold * 100 * (1 if direction == "up" else -1)
        try:
            result = yf.screen(Q("and", [Q("eq", ["region", "us"]),
                                         Q(op, ["percentchange", pct]),
                                         Q("gte", ["intradaymarketcap", 2_000_000_000])]),
                               size=100, sortField="percentchange", sortAsc=(direction == "down"))
        except Exception as exc:
            log.warning("mover screen failed (%s): %s", direction, exc)
            continue
        for q in result.get("quotes", []):
            ticker = q.get("symbol")
            if ticker in universe and ticker not in movers:
                movers[ticker] = {
                    "ticker": ticker, "name": universe[ticker]["name"],
                    "sector": universe[ticker]["sector"],
                    "change": clean(q.get("regularMarketChangePercent")),
                    "price": clean(q.get("regularMarketPrice")),
                }
    return sorted(movers.values(), key=lambda m: -abs(m["change"] or 0))


def about_company(title: str, ticker: str, name: str) -> bool:
    flat = re.sub(r"[^a-z0-9 ]+", " ", title.lower())
    if re.search(rf"\b{re.escape(ticker.lower())}\b", flat):
        return True
    return any(re.search(rf"\b{re.escape(alias)}\b", flat) for alias in aliases(name))


def breaking() -> str | None:
    """One message covering anything new since the last run, or None if quiet."""
    state = load_state()
    seen = set(state["sent"])
    blocks = []

    fresh_movers = [m for m in big_movers(universe_rows()) if f"mover:{m['ticker']}" not in seen]
    if fresh_movers:
        lines = ["<b>Big moves</b>"]
        for m in fresh_movers[:6]:
            reason = ""
            # Yahoo mixes peer stories into a ticker's feed, so only quote a
            # headline that actually names this company.
            for story in headlines(m["ticker"], since_hours=24, limit=4):
                if about_company(story["title"], m["ticker"], m["name"]):
                    reason = f" — {esc(story['title'])}"
                    break
            lines.append(f"{'▲' if m['change'] > 0 else '▼'} <b>{esc(m['ticker'])}</b> "
                         f"{m['change']:+.1f}% (${m['price']:,.2f}){reason}")
            seen.add(f"mover:{m['ticker']}")
        blocks.append("\n".join(lines))

    macro = [n for n in headlines("^GSPC", since_hours=3, limit=8, macro_only=True)
             if f"news:{n['id']}" not in seen]
    if macro:
        lines = ["<b>Market headlines</b>"]
        for n in macro[:4]:
            lines.append(f"• <a href=\"{esc(n['url'])}\">{esc(n['title'])}</a>")
            seen.add(f"news:{n['id']}")
        blocks.append("\n".join(lines))

    state["sent"] = sorted(seen)
    save_state(state)
    if not blocks:
        return None
    if url := site_url():
        blocks.append(f"<a href=\"{esc(url)}\">Dashboard →</a>")
    return "\n\n".join(blocks)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["brief", "breaking", "test"])
    p.add_argument("--dry-run", action="store_true", help="print the message instead of sending it")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for noisy in ("yfinance", "urllib3", "peewee"):
        logging.getLogger(noisy).setLevel(logging.CRITICAL)

    if args.mode == "test":
        message = "✅ <b>Alerts are connected.</b>\nMorning briefs and breaking moves will arrive here."
    elif args.mode == "brief":
        message = morning_brief()
    else:
        message = breaking()

    if message is None:
        log.info("Nothing new to report.")
        return
    if args.dry_run:
        print(message)
        return
    log.info("Sent." if send(message, silent=(args.mode == "brief")) else "Not sent.")


if __name__ == "__main__":
    main()
