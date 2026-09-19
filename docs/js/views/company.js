// Company page: valuation summary, live DCF, comps, historical financials, price.
import { columnChart, footballField, lineChart } from '../charts.js';
import { loadCompany, loadMeta, loadUniverse } from '../data.js';
import { runDCF, sensitivity, wacc } from '../dcf.js';
import { ago, byFmt, dateShort, money, mult, num, pct, price } from '../format.js';
import { deepDiveControl } from '../deepdive.js';
import { actionsPage } from '../github.js';
import { csvCell, download, esc, info, label, safeUrl, upside } from '../ui.js';

// Editable DCF inputs: [key, label, format]
const INPUTS = [
  ['Growth & margins', [['rev_growth_y1', 'Revenue growth, yr 1', 'pct'], ['rev_growth_y5', 'Revenue growth, yr 5', 'pct'],
    ['ebit_margin_y1', 'Operating margin, yr 1', 'pct'], ['ebit_margin_y5', 'Operating margin, yr 5', 'pct']]],
  ['Cash flow', [['tax_rate', 'Tax rate', 'pct'], ['da_pct', 'D&A, % of revenue', 'pct'],
    ['capex_pct', 'CapEx, % of revenue', 'pct'], ['nwc_pct', 'Working capital, % of revenue', 'pct']]],
  ['Discount rate', [['risk_free', 'Risk-free rate', 'pct'], ['beta', 'Beta', 'num'],
    ['erp', 'Equity risk premium', 'pct'], ['cost_of_debt', 'Pre-tax cost of debt', 'pct']]],
  ['Terminal value', [['terminal_growth', 'Terminal growth', 'pct'], ['exit_multiple', 'Exit EV/EBITDA', 'x'],
    ['mid_year', 'Mid-year convention', 'bool']]],
];
const EDITABLE = INPUTS.flatMap(([, items]) => items.map(i => i[0]));
const COMP_LABELS = { ev_ebitda: 'EV/EBITDA', ev_rev: 'EV/Revenue', pe: 'P/E', fpe: 'Fwd P/E', pb: 'P/B' };

const store = {
  key: t => `er:assumptions:${t}`,
  load(t) { try { return JSON.parse(localStorage.getItem(this.key(t))) || {}; } catch { return {}; } },
  save(t, v) { try { Object.keys(v).length ? localStorage.setItem(this.key(t), JSON.stringify(v)) : localStorage.removeItem(this.key(t)); } catch { /* private mode */ } },
};

const toField = (fmt, v) => fmt === 'pct' ? +(v * 100).toFixed(2) : +(+v).toFixed(fmt === 'x' ? 1 : 2);
const fromField = (fmt, s) => { const n = parseFloat(s); return Number.isFinite(n) ? (fmt === 'pct' ? n / 100 : n) : null; };
const fmtInput = (fmt, v) => fmt === 'pct' ? pct(v, 1) : fmt === 'x' ? mult(v) : num(v);

export async function renderCompany(root, ticker) {
  ticker = ticker.toUpperCase();
  const [meta, universe] = await Promise.all([loadMeta(), loadUniverse()]);
  const row = universe.rows.find(r => r.ticker === ticker);
  let c;
  try {
    c = await loadCompany(ticker);
  } catch (err) {
    if (err.status !== 404) throw err;
    return renderSnapshotOnly(root, ticker, row, meta);
  }
  renderFull(root, c, row, meta);
}

// ─── No deep dive yet: show what the screener knows ───────────────────────────
function renderSnapshotOnly(root, ticker, row, meta) {
  const actions = actionsPage();
  const dd = deepDiveControl(ticker);
  const how = `<p>Build the full model (statements, DCF, comps, management, ownership, news) for ${esc(ticker)} in about 2–3 minutes.</p>
    ${dd.html}
    <p class="muted small">Or run it by hand: ${actions ? `<a href="${esc(actions)}" target="_blank" rel="noopener">Refresh research data ↗</a>` : 'the <b>Refresh research data</b> workflow in your repo\'s Actions tab'}
    → <b>Run workflow</b> → enter <code>${esc(ticker)}</code>. To refresh it every night, add it to <code>watchlist</code> in <code>config.yaml</code>.</p>`;
  if (!row) {
    root.innerHTML = `<section class="card"><h1>${esc(ticker)}</h1>
      <p>${esc(ticker)} isn't a NYSE or Nasdaq listing in the screening universe and hasn't been deep-dived yet.</p>${how}
      <p><a href="#/screener">← Back to the screener</a></p></section>`;
    dd.wire();
    return;
  }
  const groups = [...new Set(meta.fields.map(f => f.group))];
  root.innerHTML = `
    ${header({ ticker, name: row.name, sector: row.sector, industry: row.industry, exchange: row.exchange, cik: row.cik, price: row.price })}
    <section class="card notice"><strong>Screener data only</strong>${how}</section>
    <section class="card"><div class="metric-groups">
      ${groups.map(g => `<div class="metric-group"><h3>${esc(g)}</h3><dl>
        ${meta.fields.filter(f => f.group === g).map(f => `<div><dt>${esc(f.label)}${info(f.key)}</dt><dd>${byFmt(f.fmt, row[f.key])}</dd></div>`).join('')}
      </dl></div>`).join('')}
    </div><p class="muted small">Screener data updated ${esc(row.updated || '')}.</p></section>`;
  dd.wire();
}

const secUrl = cik => cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(cik)}&owner=include&count=40` : null;
const yahooUrl = t => `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;

function header({ ticker, name, sector, industry, exchange, hq, cik, price: p, reasons = [], as_of, actions = '' }) {
  const links = [[secUrl(cik), 'SEC filings'], [yahooUrl(ticker), 'Yahoo Finance'], [`${yahooUrl(ticker)}/news`, 'All news']]
    .filter(([u]) => u).map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`).join(' · ');
  return `<section class="co-head">
    <div class="co-id">
      <h1><span class="tk-big">${esc(ticker)}</span> ${esc(name)}</h1>
      <p class="muted">${[exchange, sector, industry, hq].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="small ext-links">${links}</p>
      ${reasons.length || as_of ? `<p class="small muted">${reasons.map(r => `<span class="chip">${esc(r)}</span>`).join(' ')}
        ${as_of ? `Model data as of ${dateShort(as_of)}` : ''}</p>` : ''}
    </div>
    <div class="co-price"><span class="hero">${price(p)}</span>${actions}</div>
  </section>`;
}

// ─── Full deep dive ───────────────────────────────────────────────────────────
function renderFull(root, c, row, meta) {
  const defaults = c.assumptions;
  let overrides = store.load(c.ticker);
  for (const k of Object.keys(overrides)) if (!EDITABLE.includes(k)) delete overrides[k];
  const current = () => ({ ...defaults, ...overrides });
  const fin = c.financials, q = c.quote;
  const screenNames = Object.fromEntries(meta.screens.map(s => [s.id, s.name]));
  const reasons = c.reasons.map(r => r === 'watchlist' ? 'Watchlist' : r === 'requested' ? 'Requested' : screenNames[r] || r);
  const scale = defaults.base_revenue >= 1e10 ? { div: 1e9, unit: '$B', d: 1 } : { div: 1e6, unit: '$M', d: 0 };
  const m = v => v == null || !Number.isFinite(v) ? '—' : (v / scale.div).toLocaleString('en-US', { minimumFractionDigits: scale.d, maximumFractionDigits: scale.d }).replace('-', '−');

  const dd = deepDiveControl(c.ticker, { label: 'Refresh deep dive' });
  root.innerHTML = `
    ${header({ ...c, cik: c.cik ?? row?.cik, hq: c.profile.hq, price: q.price, reasons, as_of: c.as_of, actions: `
      <div class="head-actions">
        <button class="btn ghost" id="print" type="button">Print / PDF</button>
        <button class="btn ghost" id="export-model" type="button">Export model</button>
      </div>` })}
    <div class="dd-bar">${dd.html}</div>

    <section class="stat-strip">
      ${[['Market cap', money(q.mcap), 'mcap'], ['Enterprise value', money(q.ev), 'ev'], ['P/E (TTM)', mult(q.pe), 'pe'],
         ['P/E (fwd)', mult(q.fpe), 'fpe'], ['EV/EBITDA', mult(row?.ev_ebitda), 'ev_ebitda'], ['Dividend yield', pct(q.div_yield), 'div_yield'],
         ['Beta', num(q.beta), 'beta'], ['52-week range', `${price(q.low52)} – ${price(q.high52)}`, 'low52']]
        .map(([l, v, t]) => `<div><span class="stat-label">${label(l, t)}</span><span class="stat-value">${v}</span></div>`).join('')}
    </section>

    ${c.warnings.length ? `<section class="card warn" role="note">
      <span class="warn-icon" aria-hidden="true">!</span>
      <div><strong>Read before you pitch</strong><ul>${c.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h2>Valuation summary ${info('football_field')}</h2>
        <p class="muted">Updates live as you change the DCF assumptions below. The line marks today's price.</p></div>
      <div class="tiles" id="val-tiles"></div>
      <div id="ff"></div>
    </section>

    <section class="card">
      <div class="card-head row"><h2>Latest news</h2>
        <span class="muted small">Companies mentioned in a story are linked automatically</span></div>
      <div id="news"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Short-term outlook ${info('consensus')}</h2>
        <p class="muted">Next two fiscal years: Wall Street consensus next to your DCF, plus where the price lands if the P/E multiple holds.</p></div>
      <div id="outlook"></div>
    </section>

    <section class="card" id="dcf">
      <div class="card-head row">
        <div><h2>Discounted cash flow ${info('dcf')}</h2>
          <p class="muted">Five-year unlevered free cash flow model. Figures in ${scale.unit} except per share.</p></div>
        <div class="override-note" id="override-note"></div>
      </div>
      <div class="dcf-layout">
        <form class="assumptions" id="assumptions" autocomplete="off"></form>
        <div class="dcf-out">
          <div id="projection"></div>
          <div class="two-up">
            <div><h3>WACC ${info('wacc')}</h3><div id="wacc-table"></div></div>
            <div><h3>Equity bridge ${info('bridge')}</h3><div id="bridge"></div></div>
          </div>
          <div class="two-up">
            <div><h3>Sensitivity: perpetuity growth ${info('sensitivity')}</h3><div id="sens-perp"></div></div>
            <div><h3>Sensitivity: exit multiple ${info('sensitivity')}</h3><div id="sens-exit"></div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Trading comps ${info('comps')}</h2>
        <p class="muted">${c.comps.peers.length} closest-in-size peers in ${esc(c.comps.peers.every(p => p.industry === c.industry) ? c.industry : c.sector)}.</p></div>
      <div id="comps"></div>
      <h3>Implied share price ${info('peer_range')}</h3>
      <div id="comps-implied"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Management ${info('officers')}</h2>
        <p class="muted">Top officers and latest reported total pay. Board of directors from SEC filings is coming next.</p></div>
      <div id="officers"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Ownership ${info('top_holders')}</h2>
        <p class="muted">From 13F filings. Click a holder to see what else they own across your research.</p></div>
      <div id="ownership"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Historical financials</h2>
        <p class="muted">Fiscal years ending ${esc(fin.fiscal_year_end.slice(5))}. ${scale.unit} except per-share and ratios.</p></div>
      <div class="two-up charts">
        <div><h3>Revenue &amp; free cash flow</h3><div id="chart-rev"></div></div>
        <div><h3>Margins</h3><div id="chart-margins"></div></div>
      </div>
      <div id="fin-table"></div>
    </section>

    <section class="card">
      <div class="card-head row"><h2>Share price</h2>
        <div class="seg" id="range" role="group" aria-label="Price range">
          ${['1Y', '3Y', '5Y'].map(r => `<button type="button" data-range="${r}" aria-pressed="${r === '3Y'}">${r}</button>`).join('')}
        </div></div>
      <div id="chart-price"></div>
    </section>

    <section class="card">
      <h2>About ${esc(c.name)}</h2>
      <p class="summary">${esc(c.profile.summary || 'No description available.')}</p>
      <p class="muted small">${[safeUrl(c.profile.website) && `<a href="${esc(safeUrl(c.profile.website))}" target="_blank" rel="noopener">${esc(c.profile.website.replace(/^https?:\/\//, ''))}</a>`,
        c.profile.employees && `${Number(c.profile.employees).toLocaleString()} employees`, c.profile.industry].filter(Boolean).join(' · ')}</p>
    </section>`;

  const $ = s => root.querySelector(s);

  // ── Assumption form ──
  $('#assumptions').innerHTML = INPUTS.map(([group, items]) => `
    <fieldset><legend>${esc(group)}</legend>
      ${items.map(([k, l, fmt]) => fmt === 'bool'
        ? `<label class="check"><input type="checkbox" data-key="${k}"> ${esc(l)}${info(k)}</label>`
        : `<label class="inp"><span class="lbl">${esc(l)}${info(k)}${k === 'rev_growth_y1' ? ` <span class="src">${esc(defaults.growth_source)}${info('growth_source')}</span>` : ''}</span>
            <span class="inp-wrap"><input type="number" step="${fmt === 'pct' ? 0.1 : fmt === 'x' ? 0.5 : 0.05}" inputmode="decimal" data-key="${k}" data-fmt="${fmt}">
            <span class="unit">${fmt === 'pct' ? '%' : fmt === 'x' ? 'x' : ''}</span></span>
            <span class="default" data-default="${k}"></span></label>`).join('')}
    </fieldset>`).join('');

  const fillForm = () => {
    const a = current();
    root.querySelectorAll('#assumptions input').forEach(inp => {
      const k = inp.dataset.key;
      if (inp.type === 'checkbox') inp.checked = !!a[k];
      else if (document.activeElement !== inp) inp.value = toField(inp.dataset.fmt, a[k]);
      const d = root.querySelector(`[data-default="${k}"]`);
      if (d) d.textContent = k in overrides ? `default ${fmtInput(inp.dataset.fmt, defaults[k])}` : '';
      inp.closest('label').classList.toggle('changed', k in overrides);
    });
    const n = Object.keys(overrides).length;
    $('#override-note').innerHTML = n ? `<span>${n} assumption${n > 1 ? 's' : ''} changed</span> <button class="btn ghost small" id="reset" type="button">Reset to defaults</button>` : '';
    $('#reset')?.addEventListener('click', () => { overrides = {}; store.save(c.ticker, overrides); fillForm(); update(); });
  };

  $('#assumptions').addEventListener('input', e => {
    const inp = e.target;
    const k = inp.dataset.key;
    if (!k) return;
    const v = inp.type === 'checkbox' ? inp.checked : fromField(inp.dataset.fmt, inp.value);
    if (v == null) return;
    if (inp.type !== 'checkbox' && Math.abs(v - defaults[k]) < 1e-9) delete overrides[k];
    else if (inp.type === 'checkbox' && v === defaults[k]) delete overrides[k];
    else overrides[k] = v;
    store.save(c.ticker, overrides);
    fillForm(); update();
  });

  // ── Outputs that depend on assumptions ──
  const compMids = Object.values(c.comps.implied).map(v => v.mid).sort((a, b) => a - b);
  const compsMid = compMids.length ? compMids[Math.floor(compMids.length / 2)] : null;

  function update() {
    const a = current();
    const res = runDCF(a);
    const w = wacc(a);
    const narrow = [-0.005, 0, 0.005];
    const range = method => {
      const vals = sensitivity(a, method, narrow).grid.flat().filter(v => v != null && Number.isFinite(v));
      return vals.length ? [Math.min(...vals), Math.max(...vals)] : [null, null];
    };
    const [pl, ph] = range('perpetuity'), [el, eh] = range('exit');
    const perp = res.perpetuity?.price, exit = res.exit?.price;
    const blendVals = [perp, exit, compsMid].filter(v => v != null && v > 0);
    const blend = blendVals.length ? blendVals.reduce((s, v) => s + v, 0) / blendVals.length : null;

    const tile = (l, term, v) => `<div class="tile"><span class="tile-label">${label(l, term)}</span>
      <span class="tile-value">${price(v)}</span><span class="tile-sub">${upside(v != null ? v / q.price - 1 : null)}</span></div>`;
    $('#val-tiles').innerHTML = tile('DCF: perpetuity', 'perpetuity', perp) + tile('DCF: exit multiple', 'exit', exit) +
      tile('Comps median', 'comps', compsMid) + tile('Blended', 'blended', blend);

    footballField($('#ff'), {
      current: q.price, fmt: v => price(v).replace(/\.\d\d$/, ''),
      rows: [
        { group: 'dcf', label: 'DCF · perpetuity', low: pl, high: ph, mid: perp, midLabel: 'base case', note: 'WACC ±0.5%, terminal growth ±0.5%' },
        { group: 'dcf', label: 'DCF · exit multiple', low: el, high: eh, mid: exit, midLabel: 'base case', note: 'WACC ±0.5%, exit multiple ±1x' },
        ...Object.entries(c.comps.implied).map(([k, v]) => ({ group: 'comps', label: `Comps · ${COMP_LABELS[k]}`, low: v.low, high: v.high, mid: v.mid, midLabel: 'peer median', note: 'Peer 25th–75th percentile' })),
        { group: 'market', label: '52-week range', low: q.low52, high: q.high52 },
        { group: 'market', label: 'Street targets', low: c.street.low, high: c.street.high, mid: c.street.mean, midLabel: 'mean target', note: c.street.analysts ? `${c.street.analysts} analysts` : '' },
      ],
    });

    // Projection table
    const hist = fin.income.revenue.length - 1;
    const yrs = res.years;
    const line = (l, term, base, vals, f = m, cls = '') => `<tr class="${cls}"><th scope="row">${label(l, term)}</th><td class="hist">${base}</td>${vals.map(v => `<td>${f(v)}</td>`).join('')}</tr>`;
    $('#projection').innerHTML = `<div class="table-wrap"><table class="model">
      <thead><tr><th></th><th class="hist">FY${esc(fin.years[hist])}A</th>${yrs.map(y => `<th>FY${y.year}E</th>`).join('')}</tr></thead>
      <tbody>
        ${line('Revenue', null, m(fin.income.revenue[hist]), yrs.map(y => y.revenue))}
        ${line('Growth', 'rev_growth_y1', pct(fin.ratios.rev_growth[hist]), yrs.map(y => y.growth), pct, 'minor')}
        ${line('Operating income (EBIT)', 'ebit', m(fin.income.ebit[hist]), yrs.map(y => y.ebit))}
        ${line('Margin', 'ebit_margin_y1', pct(fin.ratios.ebit_margin[hist]), yrs.map(y => y.margin), pct, 'minor')}
        ${line('NOPAT', 'nopat', '', yrs.map(y => y.nopat))}
        ${line('+ D&A', 'da_pct', m(fin.cashflow.da[hist]), yrs.map(y => y.da))}
        ${line('− CapEx', 'capex_pct', m(fin.cashflow.capex[hist] == null ? null : -fin.cashflow.capex[hist]), yrs.map(y => y.capex))}
        ${line('− Increase in NWC', 'nwc_pct', '', yrs.map(y => y.d_nwc))}
        ${line('Unlevered free cash flow', 'fcff', '', yrs.map(y => y.fcff), m, 'total')}
        ${line('Discount factor', 'wacc', '', yrs.map(y => y.discount), v => v.toFixed(3), 'minor')}
        ${line('PV of free cash flow', null, '', yrs.map(y => y.pv))}
      </tbody></table></div>`;

    $('#wacc-table').innerHTML = kv([
      ['Risk-free rate', pct(a.risk_free, 2), 'risk_free'], ['× Beta', num(a.beta), 'beta'], ['× Equity risk premium', pct(a.erp, 2), 'erp'],
      ['Cost of equity', pct(w.cost_equity, 2), 'cost_equity', 'total'],
      ['After-tax cost of debt', pct(w.cost_debt_after_tax, 2), 'cost_of_debt'],
      ['Equity / debt weight', `${pct(w.weight_equity, 0)} / ${pct(w.weight_debt, 0)}`],
      ['WACC', pct(w.wacc, 2), 'wacc', 'total'],
    ]);

    const b = (k, f = m) => [res.perpetuity ? f(res.perpetuity[k]) : '—', res.exit ? f(res.exit[k]) : '—'];
    $('#bridge').innerHTML = `<div class="table-wrap"><table class="model compact">
      <thead><tr><th></th><th>Perpetuity ${info('perpetuity')}</th><th>Exit ${info('exit')}</th></tr></thead><tbody>
      ${[['PV of FCF, yrs 1–5', [m(res.sum_pv), m(res.sum_pv)]],
         ['PV of terminal value', b('pv_tv'), 'terminal_value'],
         ['Enterprise value', b('ev'), 'ev', 'total'],
         ['− Debt', [m(a.debt), m(a.debt)]], ['+ Cash', [m(a.cash), m(a.cash)]],
         ['− Minority interest', [m(a.minority_interest), m(a.minority_interest)], 'minority_interest'],
         ['Equity value', b('equity'), null, 'total'],
         ['÷ Shares (M)', [num(a.shares / 1e6, 1), num(a.shares / 1e6, 1)]],
         ['Implied price', b('price', price), 'implied_price', 'total'],
         ['Upside', [upside(res.perpetuity?.upside), upside(res.exit?.upside)], 'upside'],
         ['Terminal value % of EV', b('tv_share', pct), 'tv_share', 'minor'],
         ['Implied exit multiple', [mult(res.perpetuity?.implied_multiple), '—'], 'implied_multiple', 'minor'],
         ['Implied perpetual growth', ['—', pct(res.exit?.implied_growth)], 'implied_growth', 'minor'],
      ].map(([l, [x, y], t, cls]) => `<tr class="${cls || ''}"><th scope="row">${label(l, t)}</th><td>${x}</td><td>${y}</td></tr>`).join('')}
      </tbody></table></div>`;

    $('#sens-perp').innerHTML = sensTable(sensitivity(a, 'perpetuity'), 'WACC ↓ · growth →', v => pct(v, 1), q.price);
    $('#sens-exit').innerHTML = sensTable(sensitivity(a, 'exit'), 'WACC ↓ · multiple →', v => mult(v), q.price);
    renderOutlook($('#outlook'), c, res, m);
    lastRun = { a, res };
  }
  let lastRun;

  // ── Static sections ──
  renderComps($('#comps'), $('#comps-implied'), c, row);
  renderPeople($('#officers'), $('#ownership'), c);
  renderNews($('#news'), c.news || [], c.ticker);
  renderFinancials(root, fin, m, scale);
  renderPrice($('#chart-price'), c.prices, '3Y');
  $('#range').addEventListener('click', e => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    root.querySelectorAll('#range button').forEach(x => x.setAttribute('aria-pressed', x === btn));
    renderPrice($('#chart-price'), c.prices, btn.dataset.range);
  });

  $('#print').addEventListener('click', () => window.print());
  $('#export-model').addEventListener('click', () => {
    const { a, res } = lastRun;
    const lines = [['Assumption', 'Value'], ...EDITABLE.map(k => [k, a[k]]), [], ['Year', 'Revenue', 'Growth', 'EBIT', 'Margin', 'NOPAT', 'D&A', 'CapEx', 'Change in NWC', 'FCFF', 'Discount factor', 'PV'],
      ...res.years.map(y => [y.year, y.revenue, y.growth, y.ebit, y.margin, y.nopat, y.da, y.capex, y.d_nwc, y.fcff, y.discount, y.pv]), [],
      ['Method', 'Terminal value', 'PV of TV', 'Enterprise value', 'Equity value', 'Implied price', 'Upside'],
      ...['perpetuity', 'exit'].filter(k => res[k]).map(k => [k, res[k].tv, res[k].pv_tv, res[k].ev, res[k].equity, res[k].price, res[k].upside])];
    download(`${c.ticker}-dcf-${new Date().toISOString().slice(0, 10)}.csv`, lines.map(l => l.map(csvCell).join(',')).join('\n'));
  });

  fillForm();
  update();
  dd.wire();
}

function kv(rows) {
  return `<div class="table-wrap"><table class="model compact"><tbody>${rows.map(([l, v, t, cls]) =>
    `<tr class="${cls || ''}"><th scope="row">${label(l, t)}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
}

function sensTable(s, corner, fmtCol, current) {
  // Cell wash is a diverging blue (above price) / red (below) scale; the number is always printed.
  const cell = v => {
    if (v == null || !Number.isFinite(v)) return '<td>—</td>';
    const d = Math.max(-1, Math.min(1, (v / current - 1) / 0.5));
    const cls = d >= 0 ? 'pos' : 'neg';
    return `<td class="sens ${cls}" style="--a:${(Math.abs(d) * 0.35).toFixed(3)}">${price(v)}</td>`;
  };
  return `<div class="table-wrap"><table class="model sens-table">
    <thead><tr><th class="corner">${esc(corner)}</th>${s.cols.map((c, j) => `<th class="${j === 2 ? 'base' : ''}">${fmtCol(c)}</th>`).join('')}</tr></thead>
    <tbody>${s.rows.map((w, i) => `<tr><th scope="row" class="${i === 2 ? 'base' : ''}">${pct(w, 1)}</th>${s.grid[i].map((v, j) =>
      cell(v).replace('<td', `<td${i === 2 && j === 2 ? ' data-base' : ''}`)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">Shaded blue above today's ${price(current)}, red below. Center cell = base case.</p>`;
}

function renderComps(el, implEl, c, row) {
  const cols = [['mcap', 'Mkt cap', money], ['ev_ebitda', 'EV/EBITDA', mult], ['ev_rev', 'EV/Rev', mult], ['pe', 'P/E', mult],
    ['fpe', 'Fwd P/E', mult], ['pb', 'P/B', mult], ['op_m', 'Op. margin', pct], ['rev_g', 'Rev. growth', pct], ['roe', 'ROE', pct]];
  const me = row || { ticker: c.ticker, name: c.name };
  const statRow = (name, key) => `<tr class="stat"><th scope="row" colspan="2">${esc(name)}</th>${cols.map(([k]) => {
    const s = c.comps.multiples[k];
    return `<td>${s ? mult(s[key]) : ''}</td>`;
  }).join('')}</tr>`;
  el.innerHTML = `<div class="table-wrap"><table class="model comps">
    <thead><tr><th>Ticker</th><th class="wide">Company</th>${cols.map(([k, l]) => `<th><span class="th-inner">${esc(l)}${info(k)}</span></th>`).join('')}</tr></thead>
    <tbody>
      <tr class="self"><th scope="row">${esc(c.ticker)}</th><td class="wide">${esc(me.name)}</td>${cols.map(([k, , f]) => `<td>${f(me[k])}</td>`).join('')}</tr>
      ${c.comps.peers.map(p => `<tr><th scope="row"><a class="tk" href="#/company/${esc(p.ticker)}">${esc(p.ticker)}</a></th>
        <td class="wide">${esc(p.name)}</td>${cols.map(([k, , f]) => `<td>${f(p[k])}</td>`).join('')}</tr>`).join('')}
    </tbody>
    <tfoot>${statRow('Peer 25th percentile', 'low')}${statRow('Peer median', 'mid')}${statRow('Peer 75th percentile', 'high')}</tfoot>
  </table></div>`;

  const impl = Object.entries(c.comps.implied);
  implEl.innerHTML = impl.length ? `<div class="table-wrap"><table class="model compact">
    <thead><tr><th>Multiple</th><th>Low (25th)</th><th>Median</th><th>High (75th)</th><th>Upside at median</th></tr></thead>
    <tbody>${impl.map(([k, v]) => `<tr><th scope="row">${label(COMP_LABELS[k], k)}</th><td>${price(v.low)}</td><td><b>${price(v.mid)}</b></td>
      <td>${price(v.high)}</td><td>${upside(v.mid / c.quote.price - 1)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Not enough peers with meaningful multiples.</p>';
}

function renderFinancials(root, fin, m, scale) {
  const { income: i, balance: b, cashflow: cf, ratios: r, years } = fin;
  const netDebt = years.map((_, k) => b.total_debt[k] == null ? null : b.total_debt[k] - (b.cash[k] || 0));
  const rows = [
    ['Revenue', i.revenue, m, null, 'total'], ['Growth', r.rev_growth, pct, 'rev_g', 'minor'],
    ['Gross margin', r.gross_margin, pct, 'gross_m', 'minor'],
    ['Operating income (EBIT)', i.ebit, m, 'ebit'], ['Operating margin', r.ebit_margin, pct, 'op_m', 'minor'],
    ['EBITDA', i.ebitda, m, 'ebitda'], ['Net income', i.net_income, m], ['Net margin', r.net_margin, pct, 'net_m', 'minor'],
    ['Diluted EPS', i.eps, price, 'eps'],
    ['Operating cash flow', cf.cfo, m], ['Capital expenditures', cf.capex, m, 'capex_pct'],
    ['Free cash flow', cf.fcf, m, 'fcf', 'total'], ['FCF margin', r.fcf_margin, pct, 'fcf_margin', 'minor'],
    ['Stock-based comp', cf.sbc, m, 'sbc'], ['Buybacks', cf.buybacks, m, 'buybacks'], ['Dividends', cf.dividends, m],
    ['Cash & investments', b.cash, m], ['Total debt', b.total_debt, m], ['Net debt', netDebt, m, 'net_debt'],
    ['Shareholders\' equity', b.equity, m], ['ROIC', r.roic, pct, 'roic', 'total'],
  ];
  root.querySelector('#fin-table').innerHTML = `<div class="table-wrap"><table class="model">
    <thead><tr><th></th>${years.map(y => `<th>FY${esc(y)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l, vals, f, t, cls]) => `<tr class="${cls || ''}"><th scope="row">${label(l, t)}</th>${vals.map(v => `<td>${f(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;

  const fy = years.map(y => `FY${y}`);
  const axisM = v => `${(v / scale.div).toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
  columnChart(root.querySelector('#chart-rev'), {
    categories: fy, fmtY: v => `$${axisM(v)}${scale.unit.slice(1)}`,
    series: [{ name: 'Revenue', values: i.revenue }, { name: 'Free cash flow', values: cf.fcf }],
  });
  lineChart(root.querySelector('#chart-margins'), {
    x: fy, fmtY: v => pct(v, 0), fmtX: x => x, height: 220,
    series: [{ name: 'Gross margin', values: r.gross_margin }, { name: 'Operating margin', values: r.ebit_margin }, { name: 'FCF margin', values: r.fcf_margin }]
      .filter(s => s.values.some(v => v != null)),
  });
}

function renderPrice(el, prices, range) {
  const weeks = { '1Y': 52, '3Y': 156, '5Y': 1e9 }[range];
  const pts = prices.slice(-weeks - 1);
  const x = pts.map(p => p[0]);
  const fmtDate = (d, short) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', short ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
  lineChart(el, {
    x, series: [{ name: 'Close', values: pts.map(p => p[1]) }], area: true, height: 260,
    fmtY: v => `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 2 : 0 })}`, fmtX: fmtDate,
    tickX: xs => { const n = Math.min(6, xs.length); return Array.from({ length: n }, (_, k) => Math.round(k * (xs.length - 1) / (n - 1))); },
  });
}

function renderOutlook(el, c, res, m) {
  const est = c.estimates || [];
  if (!est.length) { el.innerHTML = '<p class="muted">No analyst consensus available for this company.</p>'; return; }
  const peerFpe = c.comps.multiples.fpe?.mid;
  const pe = c.quote.pe;
  const model = fy => res.years.find(y => y.year === fy);
  const range = (o, f) => o && o.low != null ? `<span class="sub">${f(o.low)} – ${f(o.high)}</span>` : '';
  const cell = (o, f) => o?.avg != null ? `${f(o.avg)}${range(o, f)}` : '—';
  const priceAt = (mult, eps) => mult && eps > 0 ? mult * eps : null;
  const rows = [
    ['Consensus revenue', 'consensus', e => cell(e.revenue, m)],
    ['Revenue growth', null, e => pct(e.revenue?.growth), 'minor'],
    ['Your DCF revenue', 'dcf', e => {
      const y = model(e.fiscal_year);
      if (!y) return '—';
      const diff = e.revenue?.avg ? y.revenue / e.revenue.avg - 1 : null;
      return `${m(y.revenue)}${diff != null ? `<span class="sub">${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)}% vs. consensus</span>` : ''}`;
    }],
    ['Consensus EPS', 'eps', e => cell(e.eps, price)],
    ['EPS growth', null, e => pct(e.eps?.growth), 'minor'],
    ['Analysts', 'analysts', e => e.eps?.analysts ?? e.revenue?.analysts ?? '—', 'minor'],
    [`Price at today's P/E (${mult(pe)})`, 'pe_projection', e => {
      const p = priceAt(pe, e.eps?.avg); return p ? `${price(p)}<span class="sub">${upside(p / c.quote.price - 1)}</span>` : '—';
    }],
    [`Price at peer fwd P/E (${mult(peerFpe)})`, 'pe_projection', e => {
      const p = priceAt(peerFpe, e.eps?.avg); return p ? `${price(p)}<span class="sub">${upside(p / c.quote.price - 1)}</span>` : '—';
    }],
  ];
  el.innerHTML = `<div class="table-wrap"><table class="model outlook">
    <thead><tr><th></th>${est.map(e => `<th>FY${e.fiscal_year}E</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l, t, f, cls]) => `<tr class="${cls || ''}"><th scope="row">${label(l, t)}</th>${est.map(e => `<td>${f(e)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function renderPeople(offEl, ownEl, c) {
  const offs = c.officers || [];
  offEl.innerHTML = offs.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th class="wide">Title</th><th class="num">Age</th><th class="num">Total pay</th></tr></thead>
    <tbody>${offs.map(o => `<tr><td><b>${esc(o.name)}</b></td><td class="wide">${esc(o.title || '')}</td>
      <td class="num">${o.age ?? '—'}</td><td class="num">${o.pay ? money(o.pay) : '—'}${o.pay && o.fiscal_year ? `<span class="sub">FY${o.fiscal_year}</span>` : ''}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="muted">No officer data reported.</p>';

  const own = c.ownership || {};
  const tiles = `<div class="tiles">
    <div class="tile"><span class="tile-label">${label('Insiders', 'insiders_pct')}</span><span class="tile-value">${pct(own.insiders_pct)}</span></div>
    <div class="tile"><span class="tile-label">${label('Institutions', 'institutions_pct')}</span><span class="tile-value">${pct(own.institutions_pct)}</span></div>
    <div class="tile"><span class="tile-label">Institutional holders</span><span class="tile-value">${own.institutions_count ? Math.round(own.institutions_count).toLocaleString() : '—'}</span></div>
  </div>`;
  const hs = own.top_holders || [];
  ownEl.innerHTML = tiles + (hs.length ? `<div class="table-wrap"><table>
    <thead><tr><th class="wide">Holder</th><th class="num">% held</th><th class="num">Value</th><th class="num">Change (qtr)</th><th class="num">As of</th></tr></thead>
    <tbody>${hs.map(h => `<tr><td class="wide"><a href="#/holder/${encodeURIComponent(h.holder)}">${esc(h.holder)}</a></td>
      <td class="num">${pct(h.pct, 2)}</td><td class="num">${money(h.value)}</td><td class="num">${upside(h.pct_change)}</td>
      <td class="num muted">${esc(h.date || '')}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="muted">No holder data reported.</p>');
}

function renderNews(el, items, ticker) {
  items = items.filter(n => safeUrl(n.url));
  if (!items.length) {
    el.innerHTML = `<p class="muted">No recent stories. <a href="${esc(yahooUrl(ticker))}/news" target="_blank" rel="noopener">Search Yahoo Finance ↗</a></p>`;
    return;
  }
  const item = n => `<li class="news-item">
    <a class="news-title" href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${n.video ? '<span class="chip">Video</span> ' : ''}${esc(n.title)}</a>
    <span class="news-meta">${esc(n.publisher || '')}${n.published ? ` · ${ago(n.published)}` : ''}</span>
    ${n.summary ? `<p class="news-summary">${esc(n.summary)}</p>` : ''}
    ${n.mentions?.length ? `<span class="news-links">${n.mentions.map(t => `<a class="chip" href="#/company/${esc(t)}">${esc(t)}</a>`).join(' ')}</span>` : ''}
  </li>`;
  const draw = all => {
    const shown = all ? items : items.slice(0, 6);
    el.innerHTML = `<ul class="news">${shown.map(item).join('')}</ul>` +
      (items.length > shown.length ? `<div class="more"><button class="btn ghost" type="button">Show ${items.length - shown.length} more</button></div>` : '');
    el.querySelector('.more button')?.addEventListener('click', () => draw(true));
  };
  draw(false);
}
