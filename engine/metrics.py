"""Screener fields: turn a Yahoo snapshot into one flat, comparable row.

FIELDS is the single source of truth for what the screener knows about. It is
written into docs/data/meta.json so the dashboard's labels, formats, and filter
controls always match what the engine produced.
"""
import math

# key, label, format, group, description
FIELDS = [
    ("price", "Price", "price", "Market", "Last price"),
    ("mcap", "Market cap", "money", "Market", "Equity market value"),
    ("ev", "Enterprise value", "money", "Market", "Market cap + debt - cash"),
    ("pe", "P/E (TTM)", "x", "Valuation", "Price / trailing 12-month diluted EPS"),
    ("fpe", "P/E (fwd)", "x", "Valuation", "Price / consensus next-year EPS"),
    ("peg", "PEG", "x", "Valuation", "P/E divided by expected EPS growth"),
    ("ps", "P/S", "x", "Valuation", "Market cap / TTM revenue"),
    ("pb", "P/B", "x", "Valuation", "Market cap / book equity"),
    ("ev_rev", "EV/Revenue", "x", "Valuation", "Enterprise value / TTM revenue"),
    ("ev_ebitda", "EV/EBITDA", "x", "Valuation", "Enterprise value / TTM EBITDA"),
    ("fcf_yield", "FCF yield", "pct", "Valuation", "TTM levered free cash flow / market cap"),
    ("div_yield", "Dividend yield", "pct", "Valuation", "Forward annual dividend / price"),
    ("gross_m", "Gross margin", "pct", "Profitability", "TTM gross profit / revenue"),
    ("op_m", "Operating margin", "pct", "Profitability", "TTM operating income / revenue"),
    ("net_m", "Net margin", "pct", "Profitability", "TTM net income / revenue"),
    ("roe", "ROE", "pct", "Profitability", "Return on equity (TTM)"),
    ("roa", "ROA", "pct", "Profitability", "Return on assets (TTM)"),
    ("rev_g", "Revenue growth", "pct", "Growth", "Latest quarter revenue vs. a year ago"),
    ("eps_g", "EPS growth", "pct", "Growth", "Latest quarter earnings vs. a year ago"),
    ("net_debt_ebitda", "Net debt/EBITDA", "x", "Balance sheet", "(Debt - cash) / TTM EBITDA; negative = net cash"),
    ("de", "Debt/Equity", "x", "Balance sheet", "Total debt / book equity"),
    ("current_ratio", "Current ratio", "x", "Balance sheet", "Current assets / current liabilities"),
    ("beta", "Beta", "num", "Risk & momentum", "5-year monthly beta vs. the S&P 500"),
    ("chg_52w", "52-week return", "pct", "Risk & momentum", "Price change over the last year"),
    ("off_high", "Off 52w high", "pct", "Risk & momentum", "Price vs. 52-week high"),
    ("short_float", "Short % float", "pct", "Risk & momentum", "Shares sold short / float"),
    ("target_upside", "Street upside", "pct", "Street", "Mean analyst target vs. price"),
    ("rec", "Analyst rating", "num", "Street", "1 = strong buy ... 5 = strong sell"),
    ("analysts", "# Analysts", "int", "Street", "Analysts covering"),
]
FIELD_KEYS = [f[0] for f in FIELDS]


def clean(x):
    """Coerce to a finite float or None (Yahoo mixes None, 'Infinity', NaN)."""
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def ratio(a, b):
    a, b = clean(a), clean(b)
    if a is None or b is None or b == 0:
        return None
    return a / b


def _round(x):
    return None if x is None else float(f"{x:.5g}")


def screener_row(base: dict, info: dict) -> dict:
    """base holds ticker/name/sector/sub_industry/index from the constituent list."""
    g = lambda k: clean(info.get(k))
    price = g("currentPrice") or g("regularMarketPrice")
    mcap = g("marketCap")
    debt, cash, ebitda = g("totalDebt"), g("totalCash"), g("ebitda")
    net_debt = None if debt is None or cash is None else debt - cash

    row = {
        "price": price,
        "mcap": mcap,
        "ev": g("enterpriseValue"),
        "pe": g("trailingPE"),
        "fpe": g("forwardPE"),
        "peg": g("trailingPegRatio") or g("pegRatio"),
        "ps": g("priceToSalesTrailing12Months"),
        "pb": g("priceToBook"),
        "ev_rev": g("enterpriseToRevenue"),
        "ev_ebitda": g("enterpriseToEbitda"),
        "fcf_yield": ratio(g("freeCashflow"), mcap),
        "div_yield": ratio(g("dividendRate"), price) or 0.0,
        "gross_m": g("grossMargins"),
        "op_m": g("operatingMargins"),
        "net_m": g("profitMargins"),
        "roe": g("returnOnEquity"),
        "roa": g("returnOnAssets"),
        "rev_g": g("revenueGrowth"),
        "eps_g": g("earningsGrowth"),
        # EBITDA <= 0 makes the ratio meaningless, not "very good".
        "net_debt_ebitda": ratio(net_debt, ebitda) if ebitda and ebitda > 0 else None,
        "de": None if g("debtToEquity") is None else g("debtToEquity") / 100,
        "current_ratio": g("currentRatio"),
        "beta": g("beta"),
        "chg_52w": g("52WeekChange"),
        "off_high": None if not price or not g("fiftyTwoWeekHigh") else price / g("fiftyTwoWeekHigh") - 1,
        "short_float": g("shortPercentOfFloat"),
        "target_upside": None if not price or not g("targetMeanPrice") else g("targetMeanPrice") / price - 1,
        "rec": g("recommendationMean"),
        "analysts": g("numberOfAnalystOpinions"),
    }
    return {**base, **{k: _round(v) for k, v in row.items()}}
