"""A valuation for every S&P 500 name, from one snapshot each.

The full model (engine/valuation.py) needs financial statements, so it only runs
for deep dives. This lighter pass values all ~500 names every night from the
data in a single quote request, which is what the dashboard ranks ideas by:

    fair value = average of (quick DCF, peer-comps value)

Both are rough by construction. They are for *ranking* candidates, not for
pitching: open the company and run a full deep dive before you use a number.
"""
import statistics

from .metrics import clean
from .valuation import clamp, comps, find_peers, path, percentile

# Ideas must clear these before they can top the list: real cash generation, a
# sane balance sheet, a result that isn't an obvious data error, and — most
# importantly — two independent methods that roughly agree.
MAX_CREDIBLE_UPSIDE = 1.0
MAX_LEVERAGE = 4.0
MAX_SPREAD = 0.5  # |DCF - comps| / fair value, or the spread among multiples
# Reported free cash flow can run well ahead of profits for a year (working
# capital swings, a light capex cycle). Capping it at a multiple of net income
# keeps one good year from being capitalised forever.
FCF_CAP_VS_EARNINGS = 1.25
MIN_EQUITY_PREMIUM = 0.035  # floor on cost of equity above the risk-free rate

# Banks, insurers and REITs fund themselves with debt as a matter of business, so
# "free cash flow" doesn't mean what it means elsewhere. Value them on multiples.
COMPS_ONLY_SECTORS = {"Financials", "Real Estate"}


def quick_dcf(info: dict, macro: dict) -> dict | None:
    """Five-year levered free cash flow DCF, discounted at the cost of equity.

    Levered FCF is already after interest, so discounting at the cost of equity
    gives equity value directly and skips the debt bridge (and the statements).
    """
    fcf = clean(info.get("freeCashflow"))
    mcap = clean(info.get("marketCap"))
    price = clean(info.get("currentPrice")) or clean(info.get("regularMarketPrice"))
    earnings = clean(info.get("netIncomeToCommon"))
    if not fcf or fcf <= 0 or not mcap or not price:
        return None
    if earnings is None or earnings <= 0:
        return None  # no profits to support the cash flow
    fcf = min(fcf, earnings * FCF_CAP_VS_EARNINGS)

    tg = macro["terminal_growth"]
    beta = clamp(clean(info.get("beta")) or 1.0, 0.5, 2.5)
    rf = macro["risk_free_rate"]
    ke = max(rf + beta * macro["equity_risk_premium"], rf + MIN_EQUITY_PREMIUM)
    if ke <= tg + 0.01:
        return None
    g1 = clamp(clean(info.get("revenueGrowth")) or 0.04, -0.10, 0.25)
    growth = path(g1, (g1 + 2 * tg) / 3)

    shares = mcap / price
    pv, flow = 0.0, fcf
    for year, g in enumerate(growth, start=1):
        flow *= 1 + g
        pv += flow / (1 + ke) ** (year - 0.5)  # mid-year, as in the full model
    terminal = flow * (1 + tg) / (ke - tg)
    equity = pv + terminal / (1 + ke) ** 5
    return {"price": equity / shares, "cost_of_equity": ke, "growth_y1": g1, "fcf": fcf}


def is_live_idea(row: dict) -> bool:
    """Rankable *and* actually undervalued — what the dashboard leads with."""
    return bool(row.get("idea") and (row.get("upside") or 0) > 0)


def value_row(row: dict, info: dict, rows: list[dict], macro: dict) -> dict:
    """Fair value for one name: quick DCF and peer comps, averaged where both apply."""
    price = row.get("price")
    comps_only = row["sector"] in COMPS_ONLY_SECTORS
    peers = find_peers(row["ticker"], rows)
    comp = comps(peers, info) if peers else {"multiples": {}, "implied": {}}
    implied = [v["mid"] for v in comp["implied"].values() if v["mid"] > 0]
    comps_value = statistics.median(implied) if len(implied) >= 2 else None

    dcf = None if comps_only else quick_dcf(info, macro)
    dcf_value = dcf["price"] if dcf and dcf["price"] > 0 else None

    values = [v for v in (dcf_value, comps_value) if v]
    fair = sum(values) / len(values) if values else None
    upside = fair / price - 1 if fair and price else None
    # How far apart the two methods are, as a share of the answer. A wide spread
    # means the methods disagree, which is a reason to distrust the ranking.
    if fair and dcf_value and comps_value:
        spread = abs(dcf_value - comps_value) / fair
    elif comps_value and len(implied) >= 3:
        # Comps-only names have no cash-flow cross-check, so measure how much the
        # individual multiples agree with each other instead.
        spread = (percentile(implied, 0.75) - percentile(implied, 0.25)) / comps_value
    else:
        spread = None

    leverage = row.get("net_debt_ebitda")
    sane = bool(fair and upside is not None and abs(upside) <= MAX_CREDIBLE_UPSIDE)
    # Utilities and other capital-heavy names often spend more than they earn in
    # cash, so no DCF is possible. Rather than leave a sector empty — OMIG has to
    # hold all of them — fall back to comps and label it in the UI.
    if comps_only or dcf_value is None:
        # No cash-flow cross-check, so demand a fuller multiple set that agrees.
        credible = bool(sane and len(comp["implied"]) >= 3
                        and spread is not None and spread <= MAX_SPREAD)
    else:
        credible = bool(
            sane
            and len(values) == 2                   # both methods produced a value
            and spread is not None and spread <= MAX_SPREAD   # and they corroborate
            and (row.get("fcf_yield") or 0) > 0
            and (leverage is None or leverage < MAX_LEVERAGE)
            and len(comp["implied"]) >= 2
        )
    return {
        "fv": fair, "upside": upside, "fv_dcf": dcf_value, "fv_comps": comps_value,
        "spread": spread, "peers": len(peers), "idea": credible,
    }


def best_by_sector(rows: list[dict], sectors: list[str], per_sector: int = 3) -> dict[str, list[dict]]:
    """Top candidates in each GICS sector — OMIG must hold every sector."""
    out = {}
    for sector in sectors:
        ranked = sorted((r for r in rows if r["sector"] == sector and is_live_idea(r)),
                        key=lambda r: -r["upside"])
        out[sector] = ranked[:per_sector]
    return out
