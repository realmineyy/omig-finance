import json
import shutil
import subprocess
from pathlib import Path

import pytest

from engine.screens import matches, run_screen
from engine.valuation import path, percentile, run_dcf, sensitivity, wacc

ROOT = Path(__file__).resolve().parent.parent

BASE = {
    "base_year": 2025, "base_revenue": 1000.0,
    "rev_growth_y1": 0.10, "rev_growth_y5": 0.04,
    "ebit_margin_y1": 0.20, "ebit_margin_y5": 0.25,
    "tax_rate": 0.21, "da_pct": 0.04, "capex_pct": 0.05, "nwc_pct": 0.10,
    "risk_free": 0.045, "beta": 1.1, "erp": 0.05, "cost_of_debt": 0.06,
    "equity_value": 4000.0, "debt": 500.0, "cash": 200.0, "minority_interest": 0.0,
    "shares": 100.0, "current_price": 40.0,
    "terminal_growth": 0.025, "exit_multiple": 12.0, "mid_year": False,
}


def test_path_is_linear():
    assert path(0.10, 0.02) == pytest.approx([0.10, 0.08, 0.06, 0.04, 0.02])


def test_wacc_by_hand():
    w = wacc(BASE)
    ke = 0.045 + 1.1 * 0.05
    kd = 0.06 * (1 - 0.21)
    assert w["wacc"] == pytest.approx(4000 / 4500 * ke + 500 / 4500 * kd)


def test_first_year_fcff_by_hand():
    y1 = run_dcf(BASE)["years"][0]
    rev = 1100.0
    fcff = rev * 0.20 * (1 - 0.21) + rev * 0.04 - rev * 0.05 - 0.10 * (rev - 1000)
    assert y1["revenue"] == pytest.approx(rev)
    assert y1["fcff"] == pytest.approx(fcff)


def test_perpetuity_bridge_by_hand():
    res = run_dcf(BASE)
    w, last = res["wacc"], res["years"][-1]
    tv = last["fcff"] * 1.025 / (w - 0.025)
    ev = sum(y["pv"] for y in res["years"]) + tv / (1 + w) ** 5
    assert res["perpetuity"]["price"] == pytest.approx((ev - 500 + 200) / 100)


def test_implied_growth_round_trips():
    """The exit method's implied growth, fed back as terminal growth, reproduces the exit value."""
    res = run_dcf(BASE)
    g = res["exit"]["implied_growth"]
    again = run_dcf({**BASE, "terminal_growth": g})
    assert again["perpetuity"]["price"] == pytest.approx(res["exit"]["price"])


def test_mid_year_raises_value():
    assert run_dcf({**BASE, "mid_year": True})["perpetuity"]["price"] > run_dcf(BASE)["perpetuity"]["price"]


def test_no_terminal_value_when_wacc_below_growth():
    assert run_dcf({**BASE, "wacc_override": 0.02})["perpetuity"] is None


def test_sensitivity_center_is_base_case():
    s = sensitivity(BASE, "perpetuity")
    assert s["grid"][2][2] == pytest.approx(run_dcf(BASE)["perpetuity"]["price"])
    assert s["grid"][0][2] > s["grid"][4][2]  # lower WACC -> higher value


def test_percentile_interpolates():
    assert percentile([1, 2, 3, 4], 0.5) == pytest.approx(2.5)
    assert percentile([5], 0.25) == 5


def test_screen_filters_and_sort():
    rows = [
        {"ticker": "A", "sector": "Energy", "roe": 0.20, "mcap": 5e9},
        {"ticker": "B", "sector": "Energy", "roe": 0.10, "mcap": 9e9},
        {"ticker": "C", "sector": "Utilities", "roe": 0.30, "mcap": 1e9},
        {"ticker": "D", "sector": "Energy", "roe": None, "mcap": 7e9},
    ]
    assert matches(rows[0], {"roe": {"min": 0.15}, "sector": ["Energy"]})
    assert not matches(rows[3], {"roe": {"min": 0.0}})  # missing data never passes
    hits = run_screen(rows, {"filters": {"sector": ["Energy"]}, "sort": {"key": "mcap", "desc": True}})
    assert [r["ticker"] for r in hits] == ["B", "D", "A"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("overrides", [{}, {"mid_year": True}, {"rev_growth_y1": -0.05, "ebit_margin_y1": -0.02}])
def test_js_dcf_matches_python(tmp_path, overrides):
    """docs/js/dcf.js must produce the same numbers as engine/valuation.py."""
    a = {**BASE, **overrides}
    module = tmp_path / "dcf.mjs"
    shutil.copy(ROOT / "docs" / "js" / "dcf.js", module)
    script = (f"import {{ runDCF, sensitivity }} from {json.dumps(str(module))};"
              f"const a = {json.dumps(a)};"
              "console.log(JSON.stringify({ dcf: runDCF(a), sens: sensitivity(a, 'exit') }));")
    out = json.loads(subprocess.run(["node", "--input-type=module", "-e", script],
                                    capture_output=True, text=True, check=True).stdout)
    py = run_dcf(a)
    for method in ("perpetuity", "exit"):
        for key in ("price", "ev", "tv", "tv_share"):
            assert out["dcf"][method][key] == pytest.approx(py[method][key], rel=1e-10)
    assert out["dcf"]["exit"]["implied_growth"] == pytest.approx(py["exit"]["implied_growth"], rel=1e-10)
    flat = lambda grid: [v for row in grid for v in row]
    assert flat(out["sens"]["grid"]) == pytest.approx(flat(sensitivity(a, "exit")["grid"]), rel=1e-10)
