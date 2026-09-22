"""The universe: S&P 500 constituents (the only stocks OMIG can hold).

Wikipedia's list carries the official GICS sector and sub-industry plus each
company's SEC CIK, so it is the whole universe definition in one table. It is
cached to cache/sp500.csv so an outage falls back to the last good copy.
"""
import io
import logging

import pandas as pd
import requests

from .config import CACHE_DIR, USER_AGENT

log = logging.getLogger(__name__)

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
CACHE_FILE = CACHE_DIR / "sp500.csv"

# The 11 GICS sectors. OMIG must hold a position in every one, so the dashboard
# always shows all eleven, even a sector with no compelling idea.
SECTORS = [
    "Information Technology", "Health Care", "Financials", "Consumer Discretionary",
    "Communication Services", "Industrials", "Consumer Staples", "Energy",
    "Utilities", "Real Estate", "Materials",
]


def to_yahoo(symbol: str) -> str:
    """Wikipedia writes share classes as BRK.B; Yahoo wants BRK-B."""
    return str(symbol).strip().upper().replace(".", "-")


def _fetch() -> pd.DataFrame:
    resp = requests.get(SP500_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    table = next(t for t in pd.read_html(io.StringIO(resp.text))
                 if "Symbol" in t.columns and "GICS Sector" in t.columns)
    df = pd.DataFrame({
        "ticker": table["Symbol"].map(to_yahoo),
        "name": table["Security"].astype(str),
        "sector": table["GICS Sector"].astype(str),
        "industry": table["GICS Sub-Industry"].astype(str),
        "cik": pd.to_numeric(table.get("CIK"), errors="coerce"),
    }).drop_duplicates("ticker")
    if len(df) < 450:
        raise ValueError(f"only {len(df)} constituents parsed")
    unknown = set(df["sector"]) - set(SECTORS)
    if unknown:
        log.warning("Unexpected GICS sector names: %s", ", ".join(sorted(unknown)))
    return df


def load_sp500() -> pd.DataFrame:
    """ticker, name, sector (GICS), industry (GICS sub-industry), cik."""
    try:
        df = _fetch()
        CACHE_DIR.mkdir(exist_ok=True)
        df.to_csv(CACHE_FILE, index=False)
        return df
    except Exception as exc:  # network or layout change -> last good copy
        if not CACHE_FILE.exists():
            raise
        log.warning("S&P 500 fetch failed (%s); using cached list", exc)
        return pd.read_csv(CACHE_FILE)
