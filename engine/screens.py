"""Screen evaluation. docs/js/screener.js applies the same filter format in the browser.

A screen's filters map a field key to either {min, max} (numeric) or a list of
allowed values (categorical: sector, industry, exchange, index).
"""
CATEGORICAL = {"sector", "industry", "exchange", "index"}


def matches(row: dict, filters: dict) -> bool:
    for key, cond in filters.items():
        value = row.get(key)
        if key in CATEGORICAL:
            if cond and value not in [str(c) for c in cond]:
                return False
            continue
        if value is None:
            return False
        if cond.get("min") is not None and value < cond["min"]:
            return False
        if cond.get("max") is not None and value > cond["max"]:
            return False
    return True


def run_screen(rows: list[dict], screen: dict) -> list[dict]:
    hits = [r for r in rows if matches(r, screen.get("filters", {}))]
    sort = screen.get("sort")
    if sort:
        key, desc = sort["key"], sort.get("desc", True)
        hits.sort(key=lambda r: (r.get(key) is None, -(r.get(key) or 0) if desc else (r.get(key) or 0)))
    return hits
