"""The screening universe: every common stock listed on the NYSE and Nasdaq.

Listings come from the SEC's free ticker file (which also gives each company's
CIK, its ID for EDGAR filings). S&P 500/400/600 membership comes from Wikipedia
and is kept as a filterable tag. Both are cached in cache/ so an outage falls
back to the last good copy instead of breaking the build.
"""
import io
import logging
import re

import pandas as pd
import requests

from .config import CACHE_DIR, USER_AGENT

log = logging.getLogger(__name__)

SEC_TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json"
SP_SOURCES = {
    "500": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "400": "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies",
    "600": "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies",
}
LISTINGS_CACHE = CACHE_DIR / "listings.csv"
SP_CACHE = CACHE_DIR / "sp_membership.csv"

# Common shares only: 1-5 letters, optionally a share class (BRK-B). This drops
# preferreds (JPM-PC), units (KCAC-UN), and other suffixed securities.
COMMON = re.compile(r"^[A-Z]{1,5}(-[A-Z])?$")


def to_yahoo(symbol: str) -> str:
    """Wikipedia/SEC write share classes as BRK.B; Yahoo wants BRK-B."""
    return symbol.strip().upper().replace(".", "-")


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp


def _cached(fetch, cache, what: str, **read_kw) -> pd.DataFrame:
    try:
        df = fetch()
        CACHE_DIR.mkdir(exist_ok=True)
        df.to_csv(cache, index=False)
        return df
    except Exception as exc:  # network or format change -> last good copy
        if not cache.exists():
            raise
        log.warning("%s fetch failed (%s); using cached copy", what, exc)
        return pd.read_csv(cache, **read_kw)


def _fetch_listings(exchanges) -> pd.DataFrame:
    data = _get(SEC_TICKERS).json()
    df = pd.DataFrame(data["data"], columns=data["fields"]).dropna(subset=["ticker"])
    df["ticker"] = df["ticker"].map(to_yahoo)
    df = df[df["exchange"].isin(exchanges) & df["ticker"].str.match(COMMON)]
    # One row per company: the SEC lists the primary class first (GOOGL before GOOG).
    df = df.drop_duplicates("cik").drop_duplicates("ticker")
    if len(df) < 1000:
        raise ValueError(f"only {len(df)} listings parsed")
    return df[["ticker", "name", "cik", "exchange"]]


def _fetch_sp() -> pd.DataFrame:
    frames = []
    for index, url in SP_SOURCES.items():
        table = next(t for t in pd.read_html(io.StringIO(_get(url).text))
                     if "Symbol" in t.columns and "GICS Sector" in t.columns)
        frames.append(pd.DataFrame({"ticker": table["Symbol"].astype(str).map(to_yahoo), "index": index}))
    df = pd.concat(frames).drop_duplicates("ticker")
    if len(df) < 1000:
        raise ValueError(f"only {len(df)} S&P constituents parsed")
    return df


def load_listings(exchanges=("NYSE", "Nasdaq")) -> pd.DataFrame:
    """ticker, name, cik, exchange, index ('500' / '400' / '600' or '')."""
    listings = _cached(lambda: _fetch_listings(list(exchanges)), LISTINGS_CACHE, "SEC listings")
    try:
        sp = _cached(_fetch_sp, SP_CACHE, "S&P membership", dtype={"index": str})
    except Exception as exc:
        log.warning("No S&P membership data (%s)", exc)
        sp = pd.DataFrame(columns=["ticker", "index"])
    df = listings.merge(sp, on="ticker", how="left")
    df["index"] = df["index"].fillna("").astype(str)
    return df.reset_index(drop=True)
