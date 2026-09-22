"""Valuation: default DCF assumptions, the DCF itself, and trading comps.

IMPORTANT: run_dcf() is mirrored line-for-line by docs/js/dcf.js so the
dashboard can re-run the model live as you change assumptions.
tests/test_parity.py fails if the two drift - change both together.
"""
import math
import statistics

from .financials import cagr, recent_avg
from .metrics import clean

# GICS sectors where an unlevered FCF DCF is the wrong tool.
DCF_UNSUITABLE = {"Financials", "Real Estate"}
# Managed care runs on premiums and reserves like an insurer, so it belongs with
# them even though GICS files it under Health Care.
DCF_UNSUITABLE_INDUSTRIES = {"Managed Health Care"}


def dcf_unsuitable(sector: str, industry: str) -> bool:
    return sector in DCF_UNSUITABLE or industry in DCF_UNSUITABLE_INDUSTRIES


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


# ─── DCF (mirrored in docs/js/dcf.js) ─────────────────────────────────────────

def path(start: float, end: float, n: int = 5) -> list[float]:
    """Linear glide from `start` in year 1 to `end` in year n."""
    return [start + (end - start) * k / (n - 1) for k in range(n)]


def wacc(a: dict) -> dict:
    cost_equity = a["risk_free"] + a["beta"] * a["erp"]
    cost_debt_after_tax = a["cost_of_debt"] * (1 - a["tax_rate"])
    e, d = max(a["equity_value"], 0), max(a["debt"], 0)
    w_e = e / (e + d) if e + d > 0 else 1.0
    return {
        "cost_equity": cost_equity,
        "cost_debt_after_tax": cost_debt_after_tax,
        "weight_equity": w_e,
        "weight_debt": 1 - w_e,
        "wacc": w_e * cost_equity + (1 - w_e) * cost_debt_after_tax,
    }


def run_dcf(a: dict) -> dict:
    """Five-year unlevered FCF DCF with perpetuity-growth and exit-multiple terminal values."""
    w = a["wacc_override"] if a.get("wacc_override") is not None else wacc(a)["wacc"]
    g = a["terminal_growth"]
    growth = path(a["rev_growth_y1"], a["rev_growth_y5"])
    margin = path(a["ebit_margin_y1"], a["ebit_margin_y5"])

    years, rev_prev, sum_pv = [], a["base_revenue"], 0.0
    for t in range(1, 6):
        rev = rev_prev * (1 + growth[t - 1])
        ebit = rev * margin[t - 1]
        nopat = ebit * (1 - a["tax_rate"])
        da = rev * a["da_pct"]
        capex = rev * a["capex_pct"]
        d_nwc = a["nwc_pct"] * (rev - rev_prev)
        fcff = nopat + da - capex - d_nwc
        period = t - 0.5 if a["mid_year"] else t
        discount = 1 / (1 + w) ** period
        pv = fcff * discount
        sum_pv += pv
        years.append({"year": a["base_year"] + t, "revenue": rev, "growth": growth[t - 1], "ebit": ebit,
                      "margin": margin[t - 1], "nopat": nopat, "da": da, "capex": capex, "d_nwc": d_nwc,
                      "fcff": fcff, "discount": discount, "pv": pv})
        rev_prev = rev

    last = years[-1]
    ebitda_final = last["ebit"] + last["da"]
    discount_tv = 1 / (1 + w) ** 5

    def bridge(tv):
        if tv is None:
            return None
        pv_tv = tv * discount_tv
        ev = sum_pv + pv_tv
        equity = ev - a["debt"] + a["cash"] - a["minority_interest"]
        price = equity / a["shares"]
        return {"tv": tv, "pv_tv": pv_tv, "ev": ev, "equity": equity, "price": price,
                "upside": price / a["current_price"] - 1, "tv_share": pv_tv / ev if ev else None}

    tv_growth = last["fcff"] * (1 + g) / (w - g) if w > g else None
    tv_exit = ebitda_final * a["exit_multiple"]
    perp, exit_ = bridge(tv_growth), bridge(tv_exit)
    if perp and ebitda_final > 0:
        perp["implied_multiple"] = tv_growth / ebitda_final
    if exit_ and tv_exit + last["fcff"] != 0:
        exit_["implied_growth"] = (tv_exit * w - last["fcff"]) / (tv_exit + last["fcff"])
    return {"wacc": w, "years": years, "sum_pv": sum_pv, "perpetuity": perp, "exit": exit_}


def sensitivity(a: dict, method: str, steps=(-0.01, -0.005, 0, 0.005, 0.01)) -> dict:
    """Implied price grid: WACC (rows) x terminal growth or exit multiple (cols)."""
    base_w = wacc(a)["wacc"]
    if method == "perpetuity":
        cols = [a["terminal_growth"] + s for s in steps]
        key = "terminal_growth"
    else:
        cols = [a["exit_multiple"] + s * 200 for s in steps]  # +/-1x, +/-2x
        key = "exit_multiple"
    rows = [base_w + s for s in steps]
    grid = []
    for w in rows:
        line = []
        for c in cols:
            res = run_dcf({**a, "wacc_override": w, key: c})[method]
            line.append(res["price"] if res else None)
        grid.append(line)
    return {"rows": rows, "cols": cols, "grid": grid}


# ─── Assumptions ──────────────────────────────────────────────────────────────

def consensus_growth(estimates, base_revenue):
    """Street revenue growth for the fiscal year after `base_revenue`'s, if it lines up."""
    try:
        row = estimates.loc["0y"]
        prior, growth = clean(row["yearAgoRevenue"]), clean(row["growth"])
    except Exception:
        return None
    # Only trust it if "0y" really is the year right after our last reported one.
    if growth is None or not prior or not base_revenue or abs(prior / base_revenue - 1) > 0.03:
        return None
    return growth


def default_assumptions(fin: dict, info: dict, macro: dict, peer_ev_ebitda, estimates=None) -> dict:
    """Derive starting assumptions from history and consensus. Every one is editable in the dashboard."""
    inc, bs, r = fin["income"], fin["balance"], fin["ratios"]
    g = lambda k: clean(info.get(k))
    rf, tg = macro["risk_free_rate"], macro["terminal_growth"]

    street = consensus_growth(estimates, inc["revenue"][-1])
    hist_growth = cagr(inc["revenue"], 3)
    if street is not None:
        g1, growth_source = clamp(street, -0.30, 0.50), "consensus"
    else:
        g1 = clamp(hist_growth if hist_growth is not None else (g("revenueGrowth") or 0.04), -0.10, 0.30)
        growth_source = "history"

    margins = [m for m in r["ebit_margin"] if m is not None]
    m_latest = margins[-1] if margins else 0.10
    m_avg = recent_avg(margins, 3) if margins else 0.10

    taxes = [t for t in r["tax_rate"][-3:] if t is not None]
    tax = clamp(statistics.median(taxes), 0.10, 0.30) if taxes else 0.21

    price = g("currentPrice") or g("regularMarketPrice")
    mcap = g("marketCap")
    debt = g("totalDebt") if g("totalDebt") is not None else (bs["total_debt"][-1] or 0)
    cash = g("totalCash") if g("totalCash") is not None else (bs["cash"][-1] or 0)

    interest = inc["interest_expense"][-1]
    kd = interest / debt if interest and debt and debt > 0 else rf + 0.015
    exit_mult = peer_ev_ebitda or g("enterpriseToEbitda") or 12.0

    return {
        "base_year": int(fin["years"][-1]),
        "base_revenue": inc["revenue"][-1],
        "rev_growth_y1": g1,
        "rev_growth_y5": (g1 + 2 * tg) / 3,
        "growth_source": growth_source,
        "ebit_margin_y1": m_latest,
        "ebit_margin_y5": m_avg,
        "tax_rate": tax,
        "da_pct": clamp(recent_avg(r["da_pct"]) or 0.03, 0, 0.5),
        "capex_pct": clamp(recent_avg(r["capex_pct"]) or 0.04, 0, 0.5),
        "nwc_pct": clamp(recent_avg(r["nwc_pct"]) or 0.0, -0.3, 0.5),
        "risk_free": rf,
        "beta": clamp(g("beta") or 1.0, 0.5, 2.5),
        "erp": macro["equity_risk_premium"],
        "cost_of_debt": clamp(kd, rf, rf + 0.06),
        "equity_value": mcap,
        "debt": debt,
        "cash": cash,
        "minority_interest": bs["minority_interest"][-1] or 0,
        "shares": mcap / price,
        "current_price": price,
        "terminal_growth": tg,
        "exit_multiple": clamp(exit_mult, 4, 30),
        "mid_year": True,
    }


def warnings_for(sector: str, industry: str, fin: dict, a: dict, fx: dict | None = None,
                 dcf: dict | None = None) -> list[str]:
    out = []
    base = (dcf or {}).get("perpetuity")
    if base and base.get("upside", 0) > 1.0:
        out.append(f"The default assumptions imply {base['upside'] * 100:.0f}% upside. A gap that wide usually means "
                   "the model, not the market, is wrong: check the margin path, the discount rate and whether "
                   "trailing cash flow is repeatable before quoting any number here.")
    if base and (base.get("tv_share") or 0) > 0.85:
        out.append(f"{base['tv_share'] * 100:.0f}% of the value sits in the terminal value, so this is really a bet "
                   "on the long-run growth and exit assumptions rather than the five-year forecast.")
    if fx:
        note = (f"Historical statements were converted at today's rate ({fx['rate']:.4g}), so past growth partly "
                "reflects currency moves. " if fx.get("statements_converted") else "")
        out.append(f"Foreign filer: reports in {fx['from']}, shown here in {fx['to']}. {note}"
                   "Per-share history is per ordinary share, which may differ from the ADR. For emerging markets, "
                   "add a country risk premium to the equity risk premium; the default WACC doesn't include one.")
    if dcf_unsuitable(sector, industry):
        what = industry if industry in DCF_UNSUITABLE_INDUSTRIES else sector
        out.append(f"{what}: the balance sheet is the business here (premiums, reserves, leverage), so an "
                   "unlevered-FCF DCF overstates value. Lean on the comps — P/E, P/B and forward P/E.")
    if len(fin["years"]) < 3:
        out.append(f"Only {len(fin['years'])} years of history. Defaults are thin; check them.")
    if a["ebit_margin_y1"] < 0:
        out.append("Operating margin is negative. The DCF depends entirely on your margin recovery assumption.")
    return out


# ─── Comps ────────────────────────────────────────────────────────────────────

COMP_MULTIPLES = ["ev_ebitda", "ev_rev", "pe", "fpe", "pb"]


def find_peers(ticker: str, rows: list[dict], n: int = 8) -> list[dict]:
    """Closest-in-size companies in the same industry (falls back to sector)."""
    me = next((r for r in rows if r["ticker"] == ticker), None)
    if not me or not me.get("mcap"):
        return []
    others = [r for r in rows if r["ticker"] != ticker and r.get("mcap")]
    pool = [r for r in others if r["industry"] == me["industry"]]
    if len(pool) < 4:
        pool = [r for r in others if r["sector"] == me["sector"]]
    size = math.log(me["mcap"])
    return sorted(pool, key=lambda r: abs(math.log(r["mcap"]) - size))[:n]


def percentile(xs: list[float], q: float):
    xs = sorted(xs)
    if not xs:
        return None
    pos = (len(xs) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def comps(peers: list[dict], info: dict, minority_interest: float = 0) -> dict:
    """Peer multiple ranges (25th / median / 75th) and the share prices they imply."""
    g = lambda k: clean(info.get(k))
    price = g("currentPrice") or g("regularMarketPrice")
    shares = g("marketCap") / price
    net_debt = (g("totalDebt") or 0) - (g("totalCash") or 0) + (minority_interest or 0)

    # What one turn of each multiple is worth per share.
    to_price = {
        "ev_ebitda": lambda m: (m * g("ebitda") - net_debt) / shares if g("ebitda") and g("ebitda") > 0 else None,
        "ev_rev": lambda m: (m * g("totalRevenue") - net_debt) / shares if g("totalRevenue") else None,
        "pe": lambda m: m * g("trailingEps") if g("trailingEps") and g("trailingEps") > 0 else None,
        "fpe": lambda m: m * g("forwardEps") if g("forwardEps") and g("forwardEps") > 0 else None,
        "pb": lambda m: m * g("bookValue") if g("bookValue") and g("bookValue") > 0 else None,
    }
    stats, implied = {}, {}
    for key in COMP_MULTIPLES:
        vals = [p[key] for p in peers if p.get(key) is not None and 0 < p[key] < 200]
        if len(vals) < 3:
            continue
        q = {"low": percentile(vals, 0.25), "mid": percentile(vals, 0.5), "high": percentile(vals, 0.75), "n": len(vals)}
        stats[key] = q
        prices = {k: to_price[key](q[k]) for k in ("low", "mid", "high")}
        if all(v is not None and v > 0 for v in prices.values()):
            implied[key] = prices
    return {"multiples": stats, "implied": implied}
