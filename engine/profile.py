"""People, ownership, and consensus estimates: the "who" and "what the Street expects"."""
import re

import pandas as pd

from .metrics import clean


def officers(info: dict) -> list[dict]:
    out = []
    for o in info.get("companyOfficers") or []:
        name = re.sub(r"\s+", " ", o.get("name") or "").strip()
        if not name:
            continue
        out.append({"name": name, "title": o.get("title"), "age": o.get("age"),
                    "pay": clean(o.get("totalPay")), "fiscal_year": o.get("fiscalYear")})
    return out


def ownership(raw: dict) -> dict:
    out = {"insiders_pct": None, "institutions_pct": None, "institutions_count": None, "top_holders": []}
    major = raw.get("major_holders")
    if isinstance(major, pd.DataFrame) and not major.empty and "Value" in major.columns:
        v = major["Value"]
        out["insiders_pct"] = clean(v.get("insidersPercentHeld"))
        out["institutions_pct"] = clean(v.get("institutionsPercentHeld"))
        out["institutions_count"] = clean(v.get("institutionsCount"))
    holders = raw.get("institutional_holders")
    if isinstance(holders, pd.DataFrame) and not holders.empty:
        for _, h in holders.iterrows():
            date = h.get("Date Reported")
            out["top_holders"].append({
                "holder": str(h.get("Holder")).strip(), "pct": clean(h.get("pctHeld")),
                "shares": clean(h.get("Shares")), "value": clean(h.get("Value")),
                "pct_change": clean(h.get("pctChange")),
                "date": date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else None,
            })
    return out


def estimates(raw: dict, base_year: int) -> list[dict]:
    """Consensus for the next two fiscal years ("0y" = the first unreported year)."""
    rev, eps = raw.get("revenue_estimate"), raw.get("earnings_estimate")
    out = []
    for offset, period in ((1, "0y"), (2, "+1y")):
        row = {"fiscal_year": base_year + offset}
        for name, df in (("revenue", rev), ("eps", eps)):
            if isinstance(df, pd.DataFrame) and period in df.index:
                r = df.loc[period]
                row[name] = {"avg": clean(r.get("avg")), "low": clean(r.get("low")), "high": clean(r.get("high")),
                             "growth": clean(r.get("growth")), "analysts": clean(r.get("numberOfAnalysts"))}
        if len(row) > 1:
            out.append(row)
    return out
