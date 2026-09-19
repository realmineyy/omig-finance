import pytest

from engine import fetch


def test_localize_converts_home_currency_fields(monkeypatch):
    monkeypatch.setitem(fetch._fx_cache, ("CNY", "USD"), 0.14)
    info = {"currency": "USD", "financialCurrency": "CNY", "marketCap": 100e9,
            "totalRevenue": 400e9, "ebitda": 100e9, "freeCashflow": 70e9, "totalDebt": 10e9, "totalCash": 300e9,
            "enterpriseToEbitda": 0.1, "priceToBook": 0.5, "bookValue": 200}
    out = fetch.localize(info)
    assert out["totalRevenue"] == pytest.approx(56e9)
    assert out["freeCashflow"] == pytest.approx(9.8e9)
    assert out["enterpriseValue"] == pytest.approx(100e9 + 1.4e9 - 42e9)
    assert out["enterpriseToEbitda"] == pytest.approx(out["enterpriseValue"] / 14e9)
    assert out["priceToBook"] is None and out["bookValue"] is None
    assert out["_fx"] == {"from": "CNY", "to": "USD", "rate": 0.14}


def test_localize_leaves_domestic_filers_alone():
    info = {"currency": "USD", "financialCurrency": "USD", "totalRevenue": 5.0, "enterpriseToEbitda": 12.0}
    out = fetch.localize(info)
    assert out["totalRevenue"] == 5.0 and out["enterpriseToEbitda"] == 12.0 and out["_fx"] is None


def test_localize_without_a_rate_blanks_mixed_currency_fields(monkeypatch):
    monkeypatch.setitem(fetch._fx_cache, ("ARS", "USD"), None)
    out = fetch.localize({"currency": "USD", "financialCurrency": "ARS", "totalRevenue": 1e12, "marketCap": 1e9})
    assert out["totalRevenue"] is None and out["marketCap"] == 1e9


def test_localize_frame_handles_integer_columns():
    import pandas as pd
    df = pd.DataFrame({"avg": [100, 200], "yearAgoRevenue": [90, 100], "currency": ["CNY", "USD"]}, index=["0y", "+1y"])
    out = fetch.localize_frame(df, {"from": "CNY", "to": "USD", "rate": 0.5})
    assert out.loc["0y", "avg"] == 50 and out.loc["0y", "yearAgoRevenue"] == 45
    assert out.loc["+1y", "avg"] == 200  # already USD, untouched


def test_statement_currency_is_inferred_from_revenue():
    import pandas as pd
    from engine.financials import statement_fx
    inc = pd.DataFrame({pd.Timestamp("2025-12-31"): [89e9]}, index=["Total Revenue"])
    # TTM revenue in USD is ~$90B: statements are already USD, so don't convert.
    assert statement_fx({"income": inc}, 90e9, 0.19) == 1.0
    # TTM revenue in USD is ~$17B: statements are in BRL, so convert.
    assert statement_fx({"income": inc}, 17e9, 0.19) == 0.19
