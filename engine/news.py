"""Company news (Yahoo Finance) with automatic links to every company a headline mentions."""
import re

# Suffixes stripped from legal names before matching ("Vital Farms, Inc." -> "vital farms").
SUFFIXES = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|l\.p|n\.v|s\.a|ag|se|nv|sa|"
    r"holdings?|group|the|class [a-c]|common stock|& co)\b\.?", re.I)
# Single-word company names that are also everyday headline words.
AMBIGUOUS = {
    "target", "block", "snap", "match", "ball", "post", "gap", "best", "crown", "first", "general", "united",
    "american", "national", "global", "energy", "capital", "financial", "international", "pioneer", "progress",
    "insight", "vital", "summit", "frontier", "alliance", "fortune", "liberty", "unity", "compass", "harmony",
    "matrix", "catalyst", "equity", "select", "premier", "pinnacle", "genesis", "vista", "atlas", "apex",
    "invesco", "mister", "big", "live", "open", "zoom", "fox", "news", "now", "ford", "shell", "chase",
}
# Trailing descriptors headlines usually drop ("Cal-Maine Foods" -> "Cal-Maine").
GENERIC_TAIL = {
    "foods", "industries", "technologies", "technology", "systems", "brands", "enterprises", "worldwide",
    "services", "solutions", "therapeutics", "pharmaceuticals", "bancorp", "bancshares", "partners",
    "resources", "entertainment", "communications", "networks", "labs", "laboratories", "biosciences",
    "sciences", "semiconductor", "software", "motors", "airlines", "stores", "restaurants", "properties",
}
EXPLICIT = re.compile(r"(?:\((?:NYSE|NASDAQ|Nasdaq|NYSEAMERICAN|AMEX)\s*:\s*([A-Z.\-]{1,6})\))|(?:\$([A-Z]{1,5})\b)")


def short_name(name: str) -> str:
    s = SUFFIXES.sub(" ", name.replace(",", " ").replace("-", " "))
    return re.sub(r"\s+", " ", re.sub(r"[^\w&' ]+", " ", s)).strip().lower()


def aliases(name: str) -> list[str]:
    """Match-safe forms of a company name, most specific first."""
    full = short_name(name)
    out = [full]
    words = full.split()
    while len(words) > 1 and words[-1] in GENERIC_TAIL:
        words = words[:-1]
        out.append(" ".join(words))
    return [a for a in out if len(a) >= 4 and (" " in a or (a not in AMBIGUOUS and len(a) >= 5))]


class Linker:
    """Finds universe companies mentioned in a piece of text."""

    def __init__(self, rows: list[dict]):
        self.tickers = {r["ticker"] for r in rows}
        names = {}
        for r in sorted(rows, key=lambda r: -(r.get("mcap") or 0)):  # bigger company wins a name clash
            for n in aliases(r.get("name") or ""):
                names.setdefault(n, r["ticker"])
        self.names = names
        # One alternation, longest names first so "general motors" beats "general".
        alts = sorted(names, key=len, reverse=True)
        self.pattern = re.compile(r"\b(" + "|".join(re.escape(n) for n in alts) + r")\b", re.I) if alts else None

    def mentions(self, text: str) -> list[str]:
        found = []
        for m in EXPLICIT.finditer(text):
            t = (m.group(1) or m.group(2)).replace(".", "-")
            if t in self.tickers:
                found.append(t)
        if self.pattern:
            flat = re.sub(r"\s+", " ", text.replace("-", " "))
            found += [self.names[m.group(1).lower()] for m in self.pattern.finditer(flat)]
        return list(dict.fromkeys(found))  # de-dupe, keep order


def parse(items, linker: Linker | None, self_ticker: str) -> list[dict]:
    out = []
    for item in items or []:
        c = item.get("content") or {}
        if c.get("contentType") not in ("STORY", "VIDEO") or not c.get("title"):
            continue
        url = (c.get("clickThroughUrl") or {}).get("url") or (c.get("canonicalUrl") or {}).get("url")
        if not url or not url.startswith(("https://", "http://")):
            continue
        text = f"{c['title']} {c.get('summary') or ''}"
        mentions = [t for t in (linker.mentions(text) if linker else []) if t != self_ticker]
        out.append({
            "title": c["title"], "summary": (c.get("summary") or "")[:400],
            "publisher": (c.get("provider") or {}).get("displayName"),
            "url": url, "published": c.get("pubDate"), "video": c.get("contentType") == "VIDEO",
            "mentions": mentions[:8],
        })
    return sorted(out, key=lambda n: n["published"] or "", reverse=True)
