"""Normalize Yahoo's annual statements into clean line items and historical ratios.

Yahoo's row names drift between companies and over time, so each line item
lists candidate rows in priority order and takes the first one present.
"""
import math

import pandas as pd

from .metrics import clean

LINE_ITEMS = {
    "income": {
        "revenue": ["Total Revenue", "Operating Revenue"],
        "gross_profit": ["Gross Profit"],
        "ebit": ["Operating Income", "EBIT"],  # core operating profit, not incl. one-offs
        "ebitda": ["Normalized EBITDA", "EBITDA"],
        "interest_expense": ["Interest Expense", "Interest Expense Non Operating"],
        "pretax_income": ["Pretax Income"],
        "tax": ["Tax Provision"],
        "net_income": ["Net Income Common Stockholders", "Net Income"],
        "eps": ["Diluted EPS", "Basic EPS"],
        "diluted_shares": ["Diluted Average Shares", "Basic Average Shares"],
    },
    "balance": {
        "cash": ["Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents"],
        "current_assets": ["Current Assets"],
        "total_assets": ["Total Assets"],
        "current_liabilities": ["Current Liabilities"],
        "current_debt": ["Current Debt And Capital Lease Obligation", "Current Debt"],
        "total_debt": ["Total Debt"],
        "minority_interest": ["Minority Interest"],
        "equity": ["Stockholders Equity", "Common Stock Equity"],
    },
    "cashflow": {
        "cfo": ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"],
        "capex": ["Capital Expenditure", "Purchase Of PPE"],
        "da": ["Depreciation And Amortization", "Depreciation Amortization Depletion", "Reconciled Depreciation"],
        "sbc": ["Stock Based Compensation"],
        "buybacks": ["Repurchase Of Capital Stock", "Common Stock Payments"],
        "dividends": ["Cash Dividends Paid", "Common Stock Dividend Paid"],
    },
}


def _div(a, b):
    return None if a is None or b in (None, 0) else a / b


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


NOT_MONEY = {"diluted_shares"}


def normalize(raw: dict[str, pd.DataFrame], fx_rate: float = 1.0) -> dict:
    """raw: {'income','balance','cashflow'} DataFrames (rows = items, cols = FY dates).
    fx_rate converts the filing currency into the quote currency (1.0 for US filers)."""
    inc = raw["income"]
    if inc is None or inc.empty:
        raise ValueError("no income statement")
    # Oldest -> newest, keeping only fiscal years that actually report revenue.
    cols = sorted(c for c in inc.columns
                  if any(clean(inc.at[r, c]) for r in LINE_ITEMS["income"]["revenue"] if r in inc.index))
    if not cols:
        raise ValueError("no revenue history")

    out = {"years": [c.strftime("%Y") for c in cols], "fiscal_year_end": cols[-1].strftime("%Y-%m-%d")}
    for stmt, items in LINE_ITEMS.items():
        df = raw.get(stmt)
        df = df if df is not None else pd.DataFrame()
        # Balance sheet / cash flow dates can differ slightly from the income statement's.
        aligned = [_nearest(df, c) for c in cols]
        out[stmt] = {k: [None] * len(cols) if df.empty else _pick_aligned(df, names, aligned)
                     for k, names in items.items()}
        if fx_rate != 1.0:
            for k, vals in out[stmt].items():
                if k not in NOT_MONEY:
                    out[stmt][k] = [None if v is None else v * fx_rate for v in vals]

    i, b, c = out["income"], out["balance"], out["cashflow"]
    n = len(cols)
    # Fill D&A from the income statement's reconciliation if the cash flow lacks it.
    c["da"] = [c["da"][k] if c["da"][k] is not None else
               (None if i["ebitda"][k] is None or i["ebit"][k] is None else i["ebitda"][k] - i["ebit"][k])
               for k in range(n)]
    c["fcf"] = [None if c["cfo"][k] is None else c["cfo"][k] + (c["capex"][k] or 0) for k in range(n)]
    # Operating working capital excludes cash and debt (those live in the EV bridge).
    b["nwc"] = [None if None in (b["current_assets"][k], b["current_liabilities"][k]) else
                (b["current_assets"][k] - (b["cash"][k] or 0))
                - (b["current_liabilities"][k] - (b["current_debt"][k] or 0))
                for k in range(n)]

    rev = i["revenue"]
    tax_rate = [_div(i["tax"][k], i["pretax_income"][k]) if (i["pretax_income"][k] or 0) > 0 else None
                for k in range(n)]
    out["ratios"] = {
        "rev_growth": [None] + [_div(rev[k] - rev[k - 1], rev[k - 1]) if None not in (rev[k], rev[k - 1]) else None
                                for k in range(1, n)],
        "gross_margin": [_div(i["gross_profit"][k], rev[k]) for k in range(n)],
        "ebit_margin": [_div(i["ebit"][k], rev[k]) for k in range(n)],
        "ebitda_margin": [_div(i["ebitda"][k], rev[k]) for k in range(n)],
        "net_margin": [_div(i["net_income"][k], rev[k]) for k in range(n)],
        "fcf_margin": [_div(c["fcf"][k], rev[k]) for k in range(n)],
        "tax_rate": tax_rate,
        "da_pct": [_div(c["da"][k], rev[k]) for k in range(n)],
        "capex_pct": [_div(-c["capex"][k], rev[k]) if c["capex"][k] is not None else None for k in range(n)],
        "nwc_pct": [_div(b["nwc"][k], rev[k]) for k in range(n)],
        "roic": [_roic(i["ebit"][k], tax_rate[k], b["total_debt"][k], b["equity"][k], b["cash"][k]) for k in range(n)],
    }
    return out


def _roic(ebit, tax, debt, equity, cash):
    if None in (ebit, equity):
        return None
    invested = (debt or 0) + equity - (cash or 0)
    if invested <= 0:
        return None
    return ebit * (1 - (tax if tax is not None else 0.21)) / invested


def _nearest(df: pd.DataFrame, when: pd.Timestamp):
    """The column of df closest to `when`, if within ~4 months."""
    if df.empty:
        return None
    best = min(df.columns, key=lambda c: abs((c - when).days))
    return best if abs((best - when).days) <= 120 else None


def _pick_aligned(df: pd.DataFrame, names: list[str], aligned: list) -> list:
    for name in names:
        if name in df.index:
            return [None if col is None else clean(df.at[name, col]) for col in aligned]
    return [None] * len(aligned)


def statement_fx(raw: dict, ttm_revenue_quote, rate: float) -> float:
    """Yahoo's statements aren't always in the currency info["financialCurrency"]
    claims (Petrobras: statements in USD, summary fields in BRL). Infer which by
    checking which interpretation lines the latest annual revenue up with TTM
    revenue (already in the quote currency). Returns the rate to apply."""
    inc = raw.get("income")
    if rate == 1.0 or not ttm_revenue_quote or inc is None or inc.empty:
        return rate
    row = next((r for r in LINE_ITEMS["income"]["revenue"] if r in inc.index), None)
    vals = [clean(v) for v in inc.loc[row].sort_index().values] if row else []
    latest = next((v for v in reversed(vals) if v), None)
    if not latest or latest <= 0 or ttm_revenue_quote <= 0:
        return rate
    as_is = abs(math.log(latest / ttm_revenue_quote))
    converted = abs(math.log(latest * rate / ttm_revenue_quote))
    return 1.0 if as_is < converted else rate


def cagr(series: list, years: int = 3):
    """Compound growth over the last `years` periods (or as many as exist)."""
    vals = [v for v in series if v is not None]
    if len(vals) < 2:
        return None
    span = min(years, len(vals) - 1)
    start, end = vals[-1 - span], vals[-1]
    if start <= 0 or end <= 0:
        return None
    return (end / start) ** (1 / span) - 1


def recent_avg(series: list, n: int = 3):
    return _avg(series[-n:])


def price_history(hist: pd.DataFrame) -> list[list]:
    """[[YYYY-MM-DD, close], ...] weekly closes."""
    if hist is None or hist.empty:
        return []
    closes = hist["Close"].dropna()
    return [[d.strftime("%Y-%m-%d"), round(float(v), 2)] for d, v in closes.items() if math.isfinite(v)]
