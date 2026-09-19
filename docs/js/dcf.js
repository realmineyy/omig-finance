// Five-year unlevered FCF DCF. Mirrors engine/valuation.py line for line so the
// dashboard can re-run the model live. tests/test_parity.py keeps them in sync;
// change both together.

export function path(start, end, n = 5) {
  return Array.from({ length: n }, (_, k) => start + (end - start) * k / (n - 1));
}

export function wacc(a) {
  const costEquity = a.risk_free + a.beta * a.erp;
  const costDebtAfterTax = a.cost_of_debt * (1 - a.tax_rate);
  const e = Math.max(a.equity_value, 0), d = Math.max(a.debt, 0);
  const wE = e + d > 0 ? e / (e + d) : 1;
  return {
    cost_equity: costEquity,
    cost_debt_after_tax: costDebtAfterTax,
    weight_equity: wE,
    weight_debt: 1 - wE,
    wacc: wE * costEquity + (1 - wE) * costDebtAfterTax,
  };
}

export function runDCF(a) {
  const w = a.wacc_override != null ? a.wacc_override : wacc(a).wacc;
  const g = a.terminal_growth;
  const growth = path(a.rev_growth_y1, a.rev_growth_y5);
  const margin = path(a.ebit_margin_y1, a.ebit_margin_y5);

  const years = [];
  let revPrev = a.base_revenue, sumPv = 0;
  for (let t = 1; t <= 5; t++) {
    const rev = revPrev * (1 + growth[t - 1]);
    const ebit = rev * margin[t - 1];
    const nopat = ebit * (1 - a.tax_rate);
    const da = rev * a.da_pct;
    const capex = rev * a.capex_pct;
    const dNwc = a.nwc_pct * (rev - revPrev);
    const fcff = nopat + da - capex - dNwc;
    const period = a.mid_year ? t - 0.5 : t;
    const discount = 1 / (1 + w) ** period;
    const pv = fcff * discount;
    sumPv += pv;
    years.push({ year: a.base_year + t, revenue: rev, growth: growth[t - 1], ebit, margin: margin[t - 1],
                 nopat, da, capex, d_nwc: dNwc, fcff, discount, pv });
    revPrev = rev;
  }

  const last = years[years.length - 1];
  const ebitdaFinal = last.ebit + last.da;
  const discountTv = 1 / (1 + w) ** 5;

  const bridge = (tv) => {
    if (tv == null) return null;
    const pvTv = tv * discountTv;
    const ev = sumPv + pvTv;
    const equity = ev - a.debt + a.cash - a.minority_interest;
    const price = equity / a.shares;
    return { tv, pv_tv: pvTv, ev, equity, price,
             upside: price / a.current_price - 1, tv_share: ev ? pvTv / ev : null };
  };

  const tvGrowth = w > g ? last.fcff * (1 + g) / (w - g) : null;
  const tvExit = ebitdaFinal * a.exit_multiple;
  const perp = bridge(tvGrowth), exit = bridge(tvExit);
  if (perp && ebitdaFinal > 0) perp.implied_multiple = tvGrowth / ebitdaFinal;
  if (exit && tvExit + last.fcff !== 0) exit.implied_growth = (tvExit * w - last.fcff) / (tvExit + last.fcff);
  return { wacc: w, years, sum_pv: sumPv, perpetuity: perp, exit };
}

// Implied price grid: WACC (rows) x terminal growth or exit multiple (cols).
export function sensitivity(a, method, steps = [-0.01, -0.005, 0, 0.005, 0.01]) {
  const baseW = wacc(a).wacc;
  const key = method === 'perpetuity' ? 'terminal_growth' : 'exit_multiple';
  const cols = method === 'perpetuity'
    ? steps.map(s => a.terminal_growth + s)
    : steps.map(s => a.exit_multiple + s * 200);  // +/-1x, +/-2x
  const rows = steps.map(s => baseW + s);
  const grid = rows.map(w => cols.map(c => {
    const res = runDCF({ ...a, wacc_override: w, [key]: c })[method];
    return res ? res.price : null;
  }));
  return { rows, cols, grid };
}
