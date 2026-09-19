"""Build the dashboard's data: screen the universe, deep-dive, value, write JSON.

    python -m engine.build                     # full run: universe + deep dives
    python -m engine.build --skip-universe     # reuse docs/data/universe.json
    python -m engine.build --tickers NVDA,CRM  # extra deep dives this run
    python -m engine.build --limit 300         # quick dev run on the largest N listings
"""
import argparse
import json
import logging
import math
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import fetch
from .config import COMPANY_DIR, SITE_DATA, load_config
from .financials import normalize, price_history, statement_fx
from .metrics import FIELD_KEYS, FIELDS, clean, screener_row
from .news import Linker, parse as parse_news
from .profile import estimates, officers, ownership
from .screens import run_screen
from .universe import load_listings
from .valuation import comps, default_assumptions, find_peers, run_dcf, sensitivity, wacc, warnings_for

log = logging.getLogger("engine")

# Yahoo's sector names -> GICS names, so sectors read the way the Street writes them.
YAHOO_TO_GICS = {
    "Technology": "Information Technology", "Healthcare": "Health Care",
    "Financial Services": "Financials", "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples", "Basic Materials": "Materials",
    "Communication Services": "Communication Services", "Industrials": "Industrials",
    "Energy": "Energy", "Utilities": "Utilities", "Real Estate": "Real Estate",
}
ROW_ID = ["ticker", "name", "sector", "industry", "exchange", "index", "cik"]
PEER_FIELDS = ROW_ID + ["price", "mcap", "ev_ebitda", "ev_rev", "pe", "fpe", "pb", "op_m", "rev_g", "roe"]
STALE_DAYS = 3  # rows older than this are tagged "stale" in the screener


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanitize(x):
    """Round floats to 6 significant figures and turn NaN/inf into null."""
    if isinstance(x, float):
        return float(f"{x:.6g}") if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: sanitize(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [sanitize(v) for v in x]
    return x


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sanitize(obj), allow_nan=False, separators=(",", ":")))


# ─── Universe ─────────────────────────────────────────────────────────────────

def base_row(listing: dict, info: dict) -> dict:
    return {
        "ticker": listing["ticker"],
        "name": info.get("longName") or info.get("shortName") or listing.get("name") or listing["ticker"],
        "sector": YAHOO_TO_GICS.get(info.get("sector"), info.get("sector") or "Other"),
        "industry": info.get("industry") or "Other",
        "exchange": listing.get("exchange") or info.get("exchange") or "",
        "index": str(listing.get("index") or ""),
        "cik": int(listing["cik"]) if listing.get("cik") else None,
    }


def build_universe(cfg: dict, limit: int | None, previous: dict[str, dict], priority: set[str],
                   budget_min: float) -> tuple[list[dict], dict[str, dict]]:
    """Rolling refresh: priority names first, then the oldest rows, until the time
    budget runs out. Rows not reached this run keep their last good data."""
    listings = load_listings(cfg["universe"]["exchanges"])
    if limit:
        listings = listings.head(limit)  # the SEC file is roughly ordered by size
    records = listings.to_dict("records")
    order = sorted(records, key=lambda l: (
        not (l["ticker"] in priority or l["index"]),            # S&P 1500 + watchlist + deep dives first
        (previous.get(l["ticker"]) or {}).get("updated") or "",  # then oldest (never fetched = oldest)
    ))
    log.info("Universe: %d listings on %s; refreshing for up to %.0f min",
             len(records), " + ".join(cfg["universe"]["exchanges"]), budget_min)
    deadline = time.monotonic() + budget_min * 60
    infos, _, _ = fetch.snapshots([l["ticker"] for l in order], deadline=deadline)

    today = date.today().isoformat()
    rows, funds, carried = [], 0, 0
    for listing in records:
        t = listing["ticker"]
        info = infos.get(t)
        if info is not None:
            if info.get("quoteType") not in (None, "EQUITY"):
                funds += 1  # closed-end funds, trusts, etc. that slipped through
                continue
            rows.append({**screener_row(base_row(listing, info), info), "updated": today})
        elif t in previous:
            rows.append({**previous[t], "index": listing["index"]})
            carried += 1
    log.info("Universe: %d rows (%d refreshed, %d carried from earlier runs, %d funds skipped)",
             len(rows), len(rows) - carried, carried, funds)
    return rows, infos


def load_universe() -> tuple[list[dict], str | None]:
    path = SITE_DATA / "universe.json"
    if not path.exists():
        return [], None
    data = json.loads(path.read_text())
    return [dict(zip(data["columns"], r)) for r in data["rows"]], data.get("as_of")


def save_universe(rows: list[dict], as_of: str) -> None:
    columns = ROW_ID + FIELD_KEYS + ["updated", "stale"]
    cutoff = (date.today() - timedelta(days=STALE_DAYS)).isoformat()
    for r in rows:
        r["stale"] = (r.get("updated") or "") < cutoff
    rows = sorted(rows, key=lambda r: -(r.get("mcap") or 0))
    write_json(SITE_DATA / "universe.json",
               {"as_of": as_of, "columns": columns, "rows": [[r.get(c) for c in columns] for r in rows]})


def ensure_rows(tickers: list[str], rows: list[dict], infos: dict) -> None:
    """Add any deep-dive ticker that isn't a NYSE/Nasdaq listing (e.g. an OTC ADR)."""
    known = {r["ticker"] for r in rows}
    for t in tickers:
        if t in known:
            continue
        try:
            info = infos.get(t) or fetch.snapshot(t)
        except Exception as exc:
            log.warning("Could not find %s: %s", t, exc)
            continue
        infos[t] = info
        rows.append({**screener_row(base_row({"ticker": t, "exchange": "other"}, info), info),
                     "updated": date.today().isoformat()})


# ─── Deep dive ────────────────────────────────────────────────────────────────

def deep_dive(ticker: str, row: dict, info: dict, rows: list[dict], macro: dict,
              reasons: list[str], linker: Linker) -> dict:
    raw = fetch.statements(ticker)
    fx = info.get("_fx")
    if fx and not fx.get("rate"):
        raise ValueError(f"no FX rate to convert {fx['from']} financials")
    stmt_rate = statement_fx(raw, clean(info.get("totalRevenue")), fx["rate"]) if fx else 1.0
    fin = normalize(raw, stmt_rate)
    for key in ("revenue_estimate", "earnings_estimate"):
        raw[key] = fetch.localize_frame(raw.get(key), fx)
    peers = find_peers(ticker, rows)
    comp = comps(peers, info, minority_interest=fin["balance"]["minority_interest"][-1] or 0)
    peer_mult = comp["multiples"].get("ev_ebitda", {}).get("mid")

    a = default_assumptions(fin, info, macro, peer_mult, raw.get("revenue_estimate"))
    dcf = run_dcf(a)
    g = lambda k: clean(info.get(k))
    return {
        "ticker": ticker,
        **{k: row.get(k) for k in ("name", "sector", "industry", "exchange", "index", "cik")},
        "as_of": now_iso(),
        "reasons": reasons,
        "profile": {
            "summary": info.get("longBusinessSummary"),
            "website": w if (w := info.get("website") or "").startswith(("https://", "http://")) else None,
            "employees": info.get("fullTimeEmployees"),
            "hq": ", ".join(x for x in (info.get("city"), info.get("state") or info.get("country")) if x),
            "currency": info.get("currency") or "USD", "fx": fx,
        },
        "quote": {
            "price": a["current_price"], "mcap": g("marketCap"), "ev": g("enterpriseValue"),
            "low52": g("fiftyTwoWeekLow"), "high52": g("fiftyTwoWeekHigh"), "beta": g("beta"),
            "shares": a["shares"], "pe": g("trailingPE"), "fpe": g("forwardPE"),
            "eps": g("trailingEps"), "feps": g("forwardEps"), "div_yield": row.get("div_yield"),
        },
        "street": {
            "low": g("targetLowPrice"), "mean": g("targetMeanPrice"), "high": g("targetHighPrice"),
            "rec": g("recommendationMean"), "rec_key": info.get("recommendationKey"),
            "analysts": g("numberOfAnalystOpinions"),
        },
        "officers": officers(info),
        "ownership": ownership(raw),
        "estimates": estimates(raw, int(fin["years"][-1])),
        "news": parse_news(raw.get("news"), linker, ticker),
        "financials": fin,
        "prices": price_history(raw["history"]),
        "assumptions": a,
        "dcf_base": {
            "wacc": wacc(a),
            "perpetuity": dcf["perpetuity"] and {k: dcf["perpetuity"][k] for k in ("price", "upside", "tv_share")},
            "exit": dcf["exit"] and {k: dcf["exit"][k] for k in ("price", "upside", "tv_share")},
            "sens_perpetuity": sensitivity(a, "perpetuity"),
            "sens_exit": sensitivity(a, "exit"),
        },
        "comps": {"peers": [{k: p.get(k) for k in PEER_FIELDS} for p in peers], **comp},
        "warnings": warnings_for(row["sector"], fin, a, fx and {**fx, "statements_converted": stmt_rate != 1.0}),
    }


REFRESH_DAYS, REFRESH_CAP = 7, 40


def stale_deep_dives(days: int, skip: set[str]) -> list[tuple[str, list[str]]]:
    """Earlier deep dives older than `days`, oldest first, keeping their original reasons."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for path in COMPANY_DIR.glob("*.json"):
        if path.stem == "index" or path.stem in skip:
            continue
        try:
            c = json.loads(path.read_text())
            as_of = datetime.fromisoformat(c["as_of"].replace("Z", "+00:00"))
        except Exception:
            continue
        if as_of < cutoff:
            out.append((as_of, path.stem, c.get("reasons") or ["requested"]))
    return [(t, why) for _, t, why in sorted(out)]


def summarize(company: dict) -> dict:
    d, q = company["dcf_base"], company["quote"]
    mids = sorted(v["mid"] for v in company["comps"]["implied"].values())
    return {
        "ticker": company["ticker"], "name": company["name"], "sector": company["sector"],
        "price": q["price"], "mcap": q["mcap"],
        "dcf_perp": d["perpetuity"] and d["perpetuity"]["price"],
        "dcf_exit": d["exit"] and d["exit"]["price"],
        "comps_mid": mids[len(mids) // 2] if mids else None,
        "street": company["street"]["mean"],
        "reasons": company["reasons"], "as_of": company["as_of"],
        "flagged": bool(company["warnings"]),
    }


def write_index() -> int:
    """Index every company file on disk, so on-demand deep dives persist between runs."""
    summaries, holders = [], {}
    for path in sorted(COMPANY_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            company = json.loads(path.read_text())
            summaries.append(summarize(company))
        except Exception as exc:
            log.warning("Skipping %s in index: %s", path.name, exc)
            continue
        # Holder -> companies, so every fund links to everything else it owns.
        for h in company.get("ownership", {}).get("top_holders", []):
            holders.setdefault(h["holder"], []).append(
                {"ticker": company["ticker"], "name": company["name"], "pct": h["pct"],
                 "value": h["value"], "pct_change": h["pct_change"]})
    write_json(COMPANY_DIR / "index.json", {"as_of": now_iso(), "companies": summaries})
    write_json(SITE_DATA / "holders.json", {"as_of": now_iso(), "holders": holders})
    return len(summaries)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skip-universe", action="store_true", help="reuse the existing universe.json")
    p.add_argument("--tickers", default="", help="comma-separated extra deep dives")
    p.add_argument("--limit", type=int, help="only the largest N listings (dev)")
    p.add_argument("--budget", type=float, help="minutes to spend refreshing the universe (overrides config)")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for noisy in ("yfinance", "urllib3", "peewee"):
        logging.getLogger(noisy).setLevel(logging.CRITICAL)

    started = time.time()
    cfg = load_config()
    macro = {**cfg["macro"], "risk_free_rate": fetch.risk_free_rate(cfg["macro"]["risk_free_rate"])}
    log.info("Risk-free rate: %.2f%%", macro["risk_free_rate"] * 100)

    previous, previous_as_of = load_universe()
    requested = [s.strip().upper() for s in args.tickers.split(",") if s.strip()]
    if args.skip_universe and previous:
        rows, infos, universe_as_of = previous, {}, previous_as_of
    else:
        priority = {t.upper() for t in cfg["watchlist"]} | set(requested) | {p.stem for p in COMPANY_DIR.glob("*.json")}
        rows, infos = build_universe(cfg, args.limit, {r["ticker"]: r for r in previous}, priority,
                                     args.budget or cfg["universe"]["time_budget_minutes"])
        universe_as_of = now_iso()

    # Who gets a deep dive, and why.
    reasons: dict[str, list[str]] = {}
    for t in cfg["watchlist"]:
        reasons.setdefault(t.upper(), []).append("watchlist")
    for t in requested:
        reasons.setdefault(t, []).append("requested")
    ensure_rows(list(reasons), rows, infos)
    for screen in cfg["screens"]:
        for r in run_screen(rows, screen)[: screen.get("deep_dive_top", 0)]:
            reasons.setdefault(r["ticker"], []).append(screen["id"])
    if not args.skip_universe:  # nightly: keep earlier (e.g. on-demand) deep dives from going stale
        for t, why in stale_deep_dives(REFRESH_DAYS, set(reasons))[:REFRESH_CAP]:
            reasons[t] = why
    save_universe(rows, universe_as_of)

    linker = Linker(rows)
    by_ticker = {r["ticker"]: r for r in rows}
    ok, failed = 0, []
    for t, why in reasons.items():
        if t not in by_ticker:
            failed.append(t)
            continue
        try:
            info = infos.get(t) or fetch.snapshot(t)
            write_json(COMPANY_DIR / f"{t}.json", deep_dive(t, by_ticker[t], info, rows, macro, why, linker))
            ok += 1
            log.info("Deep dive: %-6s ok (%s)", t, ", ".join(why))
        except Exception as exc:
            failed.append(t)
            log.warning("Deep dive: %-6s FAILED: %s", t, exc)
    n_index = write_index()

    write_json(SITE_DATA / "meta.json", {
        "built_at": now_iso(),
        "universe_as_of": universe_as_of,
        "universe_size": len(rows),
        "exchanges": cfg["universe"]["exchanges"],
        "macro": macro,
        "fields": [dict(zip(("key", "label", "fmt", "group", "desc"), f)) for f in FIELDS],
        "screens": cfg["screens"],
        "watchlist": [t.upper() for t in cfg["watchlist"]],
        "failed": failed,
    })
    log.info("Done in %.0fs: %d rows, %d deep dives (%d failed), %d companies indexed",
             time.time() - started, len(rows), ok, len(failed), n_index)


if __name__ == "__main__":
    main()
