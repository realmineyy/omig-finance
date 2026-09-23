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


def test_market_hours_gate():
    from datetime import datetime, timezone
    from engine.alerts import market_open_now
    # 2026-09-23 is a Wednesday. 14:00 UTC = 10:00am ET (open), 02:00 UTC = 10pm ET (closed).
    assert market_open_now(datetime(2026, 9, 23, 14, 0, tzinfo=timezone.utc))
    assert not market_open_now(datetime(2026, 9, 23, 2, 0, tzinfo=timezone.utc))
    # Saturday midday is closed.
    assert not market_open_now(datetime(2026, 9, 26, 15, 0, tzinfo=timezone.utc))


def test_long_alerts_are_split_into_several_messages(monkeypatch):
    from engine import alerts
    sent = []
    monkeypatch.setattr(alerts, "send", lambda text, silent=False: sent.append(text) or True)
    blocks = ["x" * 2000, "y" * 2000, "z" * 100]
    assert alerts.send_chunks(blocks) == 2          # 2000+2000 exceeds the cap, so it splits
    assert len(sent) == 2 and sent[0].startswith("x") and "z" in sent[1]
