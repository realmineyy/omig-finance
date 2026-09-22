import pytest

from engine.quickval import best_by_sector, quick_dcf, value_row

MACRO = {"risk_free_rate": 0.045, "equity_risk_premium": 0.05, "terminal_growth": 0.025}
INFO = {"freeCashflow": 1e9, "netIncomeToCommon": 1.2e9, "marketCap": 20e9, "currentPrice": 100.0, "beta": 1.0,
        "revenueGrowth": 0.08, "ebitda": 3e9, "totalRevenue": 10e9, "totalDebt": 2e9,
        "totalCash": 1e9, "trailingEps": 5.0, "forwardEps": 5.5, "bookValue": 30.0}


def test_quick_dcf_by_hand():
    res = quick_dcf(INFO, MACRO)
    ke = 0.045 + 1.0 * 0.05
    g = [0.08 + (((0.08 + 2 * 0.025) / 3) - 0.08) * k / 4 for k in range(5)]
    pv, flow = 0.0, 1e9
    for year, gr in enumerate(g, start=1):
        flow *= 1 + gr
        pv += flow / (1 + ke) ** (year - 0.5)
    equity = pv + (flow * 1.025 / (ke - 0.025)) / (1 + ke) ** 5
    assert res["cost_of_equity"] == pytest.approx(ke)
    assert res["price"] == pytest.approx(equity / 200e6)  # 20e9 / 100


def test_quick_dcf_skips_companies_without_positive_cash_flow():
    assert quick_dcf({**INFO, "freeCashflow": -5e8}, MACRO) is None
    assert quick_dcf({**INFO, "freeCashflow": None}, MACRO) is None


def test_quick_dcf_needs_discount_rate_above_terminal_growth():
    assert quick_dcf(INFO, {**MACRO, "risk_free_rate": 0.0, "equity_risk_premium": 0.0}) is None


def _peer(ticker, **over):
    base = {"ticker": ticker, "name": ticker, "sector": "Industrials", "industry": "Machinery",
            "mcap": 20e9, "price": 100.0, "ev_ebitda": 12.0, "ev_rev": 2.0, "pe": 18.0,
            "fpe": 16.0, "pb": 3.0, "fcf_yield": 0.05, "net_debt_ebitda": 1.0}
    return {**base, **over}


def test_value_row_averages_the_two_methods_and_flags_a_credible_idea():
    rows = [_peer("ME"), *[_peer(f"P{i}") for i in range(6)]]
    out = value_row(rows[0], INFO, rows, MACRO)
    assert out["fv_dcf"] and out["fv_comps"]
    assert out["fv"] == pytest.approx((out["fv_dcf"] + out["fv_comps"]) / 2)
    assert out["upside"] == pytest.approx(out["fv"] / 100.0 - 1)
    assert out["idea"] is True


def test_value_row_rejects_leveraged_or_cash_burning_names():
    rows = [_peer("ME", net_debt_ebitda=6.0), *[_peer(f"P{i}") for i in range(6)]]
    assert value_row(rows[0], INFO, rows, MACRO)["idea"] is False
    rows = [_peer("ME", fcf_yield=-0.01), *[_peer(f"P{i}") for i in range(6)]]
    assert value_row(rows[0], INFO, rows, MACRO)["idea"] is False


def test_best_by_sector_ranks_and_covers_every_sector():
    rows = [
        {"ticker": "A", "sector": "Energy", "upside": 0.30, "idea": True},
        {"ticker": "B", "sector": "Energy", "upside": 0.50, "idea": False},  # not credible
        {"ticker": "C", "sector": "Energy", "upside": 0.10, "idea": True},
        {"ticker": "D", "sector": "Utilities", "upside": 0.05, "idea": True},
    ]
    out = best_by_sector(rows, ["Energy", "Utilities", "Materials"], per_sector=2)
    assert [r["ticker"] for r in out["Energy"]] == ["A", "C"]
    assert [r["ticker"] for r in out["Utilities"]] == ["D"]
    assert out["Materials"] == []  # sector with no idea is still reported, empty


def test_financials_are_valued_on_comps_only():
    rows = [_peer("ME", sector="Financials", industry="Insurance"),
            *[_peer(f"P{i}", sector="Financials", industry="Insurance") for i in range(6)]]
    out = value_row(rows[0], INFO, rows, MACRO)
    assert out["fv_dcf"] is None          # no levered-FCF DCF for banks/insurers
    assert out["fv"] == out["fv_comps"]
    assert out["idea"] is True            # credible on a full multiple set


def test_idea_needs_the_two_methods_to_agree():
    rows = [_peer("ME"), *[_peer(f"P{i}") for i in range(6)]]
    # Peers priced far above the company make comps disagree with the DCF.
    for r in rows[1:]:
        r.update(pe=60.0, fpe=55.0, ev_ebitda=45.0, ev_rev=9.0, pb=12.0)
    out = value_row(rows[0], INFO, rows, MACRO)
    assert out["spread"] > 0.5 and out["idea"] is False


def test_free_cash_flow_is_capped_against_earnings():
    """A one-off cash-flow spike far above profits must not drive the value."""
    normal = quick_dcf({**INFO, "netIncomeToCommon": 8e8}, MACRO)
    spike = quick_dcf({**INFO, "freeCashflow": 5e9, "netIncomeToCommon": 8e8}, MACRO)
    assert spike["fcf"] == pytest.approx(8e8 * 1.25)
    assert spike["price"] == pytest.approx(normal["price"])


def test_loss_making_companies_get_no_quick_dcf():
    assert quick_dcf({**INFO, "netIncomeToCommon": -2e8}, MACRO) is None


def test_cost_of_equity_has_a_floor_over_the_risk_free_rate():
    low_beta = quick_dcf({**INFO, "beta": 0.2, "netIncomeToCommon": 2e9}, MACRO)
    assert low_beta["cost_of_equity"] == pytest.approx(MACRO["risk_free_rate"] + 0.035)


def test_capital_heavy_names_fall_back_to_comps_so_no_sector_is_empty():
    """A utility that burns cash still gets a comps valuation and can be ranked."""
    rows = [_peer("ME", sector="Utilities", industry="Utilities - Regulated"),
            *[_peer(f"P{i}", sector="Utilities", industry="Utilities - Regulated") for i in range(6)]]
    burning = {**INFO, "freeCashflow": -3e8}
    out = value_row(rows[0], burning, rows, MACRO)
    assert out["fv_dcf"] is None and out["fv"] == out["fv_comps"]
    assert out["idea"] is True
