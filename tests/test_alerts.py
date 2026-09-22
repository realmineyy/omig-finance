from engine.alerts import about_company, big_movers, esc


def test_only_headlines_that_name_the_company_are_quoted():
    assert about_company("Sandisk Jumps 6.6% as AI Storage Tightens", "SNDK", "SanDisk Corporation")
    assert about_company("Why MPWR stock fell today", "MPWR", "Monolithic Power Systems")
    # A peer's story that Yahoo filed under this ticker must not be attached.
    assert not about_company("Why Did Vicor Stock Jump Before It Raised Its Outlook?",
                             "MPWR", "Monolithic Power Systems")


def test_telegram_escaping():
    assert esc("AT&T <b>") == "AT&amp;T &lt;b&gt;"
    assert esc(None) == ""


def test_movers_are_limited_to_the_universe(monkeypatch):
    quotes = {"quotes": [
        {"symbol": "AAPL", "regularMarketChangePercent": 6.1, "regularMarketPrice": 300.0},
        {"symbol": "ZZZZ", "regularMarketChangePercent": 9.0, "regularMarketPrice": 5.0},  # not in the S&P 500
    ]}
    monkeypatch.setattr("yfinance.screen", lambda *a, **k: quotes)
    rows = [{"ticker": "AAPL", "name": "Apple Inc.", "sector": "Information Technology"}]
    out = big_movers(rows)
    assert [m["ticker"] for m in out] == ["AAPL"]
    assert out[0]["sector"] == "Information Technology"
