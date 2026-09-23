"""Continuous market news: public RSS feeds plus SEC filings, linked to S&P 500 names.

Polling 500 tickers one at a time would be thousands of requests an hour. Instead
this pulls a handful of broad feeds (~200 headlines) and works out which S&P 500
companies each headline is about, which costs about ten requests per cycle.

SEC "current filings" is the other half: an 8-K is a company telling the SEC
something material just happened, which is breaking news by definition.
"""
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .config import USER_AGENT
from .news import Linker

log = logging.getLogger("newsfeed")

BROWSER_UA = "Mozilla/5.0 (compatible; omig-research/1.0; +https://github.com/)"
ATOM = "{http://www.w3.org/2005/Atom}"

# Broad market feeds. Each is free, public, and needs no key.
FEEDS = [
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("CNBC Markets", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("MarketWatch Pulse", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse"),
    ("Seeking Alpha", "https://seekingalpha.com/market_currents.xml"),
]

# SEC forms worth waking someone up for.
FILING_FORMS = {
    "8-K": "material event",
    "SC 13D": "activist stake",
}
EDGAR_CURRENT = ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
                 "&type={form}&count=100&output=atom")
# "8-K - Acme Corp (0000123456) (Filer)" — the form itself contains hyphens,
# so split on the spaced separator, not the first hyphen.
FILING_TITLE = re.compile(r"^(?P<form>.+?)\s+-\s+(?P<name>.+?)\s*\((?P<cik>\d{4,10})\)")

# Headlines about the market as a whole rather than one company.
MACRO_PATTERN = re.compile(
    r"\b(fed|fomc|powell|rate cut|rate hike|interest rates|inflation|cpi|ppi|jobs report|payrolls|"
    r"unemployment|jobless claims|recession|gdp|tariff|shutdown|debt ceiling|yield curve|"
    r"treasury yield|bond market|oil price|opec|s&p 500|nasdaq composite|dow jones|stock market|"
    r"futures|selloff|rally|correction|bear market|bull market)\b", re.I)


def _get(url: str, ua: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "application/xml, */*"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


def _when(text: str | None) -> datetime | None:
    if not text:
        return None
    try:  # RFC 822 (RSS)
        return parsedate_to_datetime(text).astimezone(timezone.utc)
    except (TypeError, ValueError):
        pass
    try:  # ISO 8601 (Atom)
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def fetch_feed(source: str, url: str) -> list[dict]:
    """One RSS/Atom feed -> [{id, title, url, source, published}]."""
    try:
        return parse_feed(source, _get(url, BROWSER_UA))
    except (urllib.error.URLError, ET.ParseError, OSError) as exc:
        log.warning("feed %s unavailable: %s", source, exc)
        return []


def parse_feed(source: str, raw: bytes) -> list[dict]:
    """Parse RSS or Atom bytes. Both shapes appear across these sources."""
    root = ET.fromstring(raw)
    out = []
    for item in root.findall(".//item") + root.findall(f".//{ATOM}entry"):
        title = (item.findtext("title") or item.findtext(f"{ATOM}title") or "").strip()
        link = item.findtext("link") or ""
        if not link:
            anchor = item.find(f"{ATOM}link")
            link = anchor.get("href", "") if anchor is not None else ""
        if not title or not link.startswith("http"):
            continue
        published = _when(item.findtext("pubDate") or item.findtext(f"{ATOM}updated")
                          or item.findtext(f"{ATOM}published"))
        out.append({"id": item.findtext("guid") or link, "title": title, "url": link,
                    "source": source, "published": published})
    return out


def fetch_filings(universe_by_cik: dict[int, dict]) -> list[dict]:
    """Recent SEC filings by S&P 500 companies, newest first."""
    out = []
    for form, meaning in FILING_FORMS.items():
        try:
            root = ET.fromstring(_get(EDGAR_CURRENT.format(form=urllib.parse.quote(form)), USER_AGENT))
        except (urllib.error.URLError, ET.ParseError, OSError) as exc:
            log.warning("EDGAR %s feed unavailable: %s", form, exc)
            continue
        for entry in root.findall(f".//{ATOM}entry"):
            title = (entry.findtext(f"{ATOM}title") or "").strip()
            match = FILING_TITLE.match(title)
            if not match:
                continue
            row = universe_by_cik.get(int(match["cik"]))
            if not row:
                continue  # not an S&P 500 filer
            link = entry.find(f"{ATOM}link")
            out.append({
                "id": entry.findtext(f"{ATOM}id") or title,
                "ticker": row["ticker"], "name": row["name"],
                "form": match["form"].strip(), "meaning": meaning,
                "url": link.get("href", "") if link is not None else "",
                "published": _when(entry.findtext(f"{ATOM}updated")),
            })
    return sorted(out, key=lambda f: f["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)


def collect(rows: list[dict]) -> dict[str, list[dict]]:
    """Everything the feeds have right now, split into company / market / filings.

    Nothing is filtered by age here — the caller's "already sent" state decides
    what is new, so a slow news hour doesn't replay old headlines.
    """
    linker = Linker(rows)
    stories = [story for source, url in FEEDS for story in fetch_feed(source, url)]

    company, macro = [], []
    for story in stories:
        tickers = linker.mentions(story["title"])
        if tickers:
            company.append({**story, "tickers": tickers})
        elif MACRO_PATTERN.search(story["title"]):
            macro.append(story)

    by_cik = {int(r["cik"]): r for r in rows if r.get("cik")}
    return {"company": company, "macro": macro, "filings": fetch_filings(by_cik)}
