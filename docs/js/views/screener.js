// Screener: filter the whole universe in the browser. Same filter format as
// config.yaml screens (engine/screens.py applies it identically in Python).
import { loadIndex, loadMeta, loadUniverse } from '../data.js';
import { byFmt, fromInput, INPUT_UNITS, toInput } from '../format.js';
import { csvCell, download, esc, info, sortRows, table, wireRowLinks, wireSort } from '../ui.js';

const CATEGORICAL = new Set(['sector', 'industry', 'exchange', 'index']);
const INDEX_LABELS = { 500: 'S&P 500', 400: 'S&P 400', 600: 'S&P 600', '': 'Not in S&P' };
const DEFAULT_COLS = ['mcap', 'pe', 'ev_ebitda', 'fcf_yield', 'op_m', 'roe', 'rev_g', 'net_debt_ebitda', 'off_high', 'target_upside'];
const PAGE = 200;

export function matches(row, filters) {
  for (const [key, cond] of Object.entries(filters || {})) {
    const v = row[key];
    if (CATEGORICAL.has(key)) {
      if (cond?.length && !cond.map(String).includes(String(v))) return false;
      continue;
    }
    if (v == null) return false;
    if (cond.min != null && v < cond.min) return false;
    if (cond.max != null && v > cond.max) return false;
  }
  return true;
}

function readState(params, meta) {
  if (params.get('s')) {
    try { return JSON.parse(params.get('s')); } catch { /* fall through to preset/default */ }
  }
  const preset = meta.screens.find(s => s.id === params.get('preset'));
  if (preset) return { preset: preset.id, filters: structuredClone(preset.filters), sort: preset.sort || { key: 'mcap', desc: true }, q: '' };
  return { filters: { mcap: { min: 2e9 } }, sort: { key: 'mcap', desc: true }, q: '' };
}

export async function renderScreener(root, params) {
  const [meta, universe, index] = await Promise.all([loadMeta(), loadUniverse(), loadIndex()]);
  const fields = Object.fromEntries(meta.fields.map(f => [f.key, f]));
  const deep = new Set(index.companies.map(c => c.ticker));
  const sectors = [...new Set(universe.rows.map(r => r.sector))].sort();
  const exchanges = [...new Set(universe.rows.map(r => r.exchange).filter(Boolean))].sort();
  let state = readState(params, meta);
  let showAll = false;

  const groups = [...new Set(meta.fields.map(f => f.group))];
  root.innerHTML = `
    <section class="page-head">
      <div><h1>Screener</h1>
        <p class="muted">${universe.rows.length.toLocaleString()} stocks listed on the ${esc(meta.exchanges.join(' and '))} · Filters combine with AND</p></div>
    </section>
    <section class="card filters">
      <div class="filter-row">
        <label class="field"><span>Saved screen</span>
          <select id="preset"><option value="">Custom</option>
            ${meta.screens.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field grow"><span>Search</span>
          <input id="q" type="search" placeholder="Ticker, name, or industry" autocomplete="off"></label>
        <div class="field-actions">
          <button class="btn ghost" id="reset" type="button">Reset</button>
          <button class="btn ghost" id="export" type="button">Export CSV</button>
        </div>
      </div>
      <p id="preset-desc" class="muted small"></p>
      <div class="chip-row" id="sectors" role="group" aria-label="Sectors"></div>
      <div class="chip-row" id="indexes" role="group" aria-label="Index"></div>
      <div class="chip-row" id="exchanges" role="group" aria-label="Exchange"></div>
      <label class="field industry"><span>Industry</span><select id="industry"></select></label>
      <div id="numeric"></div>
      <label class="field add-filter"><span>Add a filter</span>
        <select id="add"><option value="">Choose a metric…</option>
          ${groups.map(g => `<optgroup label="${esc(g)}">${meta.fields.filter(f => f.group === g)
            .map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>
    </section>
    <section class="card">
      <div class="card-head row"><h2 id="count"></h2><span class="muted small">★ = full deep dive available</span></div>
      <div id="results"></div>
    </section>`;

  const $ = s => root.querySelector(s);
  $('#q').value = state.q || '';

  const saveUrl = () => {
    const s = encodeURIComponent(JSON.stringify(state));
    history.replaceState(null, '', `#/screener?s=${s}`);
  };

  const drawControls = () => {
    $('#preset').value = state.preset || '';
    const preset = meta.screens.find(s => s.id === state.preset);
    $('#preset-desc').textContent = preset?.description || '';
    const chips = (key, title, values, labelOf = v => v) => {
      const sel = (state.filters[key] || []).map(String);
      return `<span class="chip-label">${title}</span>` + values.map(v =>
        `<button type="button" class="chip toggle" aria-pressed="${sel.includes(String(v))}" data-key="${key}" data-val="${esc(v)}">${esc(labelOf(v))}</button>`).join('');
    };
    $('#sectors').innerHTML = chips('sector', 'Sector', sectors);
    $('#indexes').innerHTML = chips('index', 'Index', ['500', '400', '600', ''], v => INDEX_LABELS[v]);
    $('#exchanges').innerHTML = chips('exchange', 'Exchange', exchanges);
    // Industry list narrows to the selected sectors.
    const secSel = state.filters.sector || [];
    const industries = [...new Set(universe.rows.filter(r => !secSel.length || secSel.includes(r.sector)).map(r => r.industry))].sort();
    const indSel = state.filters.industry?.[0] || '';
    $('#industry').innerHTML = `<option value="">All industries (${industries.length})</option>` +
      industries.map(i => `<option value="${esc(i)}"${i === indSel ? ' selected' : ''}>${esc(i)}</option>`).join('');

    const numeric = Object.entries(state.filters).filter(([k]) => !CATEGORICAL.has(k) && fields[k]);
    $('#numeric').innerHTML = numeric.length ? numeric.map(([k, c]) => {
      const f = fields[k], unit = INPUT_UNITS[f.fmt]?.suffix || (f.fmt === 'x' ? 'x' : '');
      return `<div class="num-filter" data-key="${esc(k)}">
        <span class="lbl">${esc(f.label)}${info(k)}</span>
        <input type="number" step="any" inputmode="decimal" data-bound="min" placeholder="min" value="${toInput(f.fmt, c.min)}" aria-label="${esc(f.label)} minimum">
        <span class="muted">to</span>
        <input type="number" step="any" inputmode="decimal" data-bound="max" placeholder="max" value="${toInput(f.fmt, c.max)}" aria-label="${esc(f.label)} maximum">
        <span class="unit muted">${esc(unit)}</span>
        <button type="button" class="icon-btn" data-remove="${esc(k)}" aria-label="Remove ${esc(f.label)} filter">×</button>
      </div>`;
    }).join('') : '<p class="muted small">No metric filters. Add one below.</p>';
  };

  const drawResults = () => {
    const q = (state.q || '').trim().toLowerCase();
    let rows = universe.rows.filter(r => matches(r, state.filters) &&
      (!q || r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.industry.toLowerCase().includes(q)));
    const keys = [...new Set([...DEFAULT_COLS, ...Object.keys(state.filters).filter(k => fields[k])])];
    const cols = [
      { key: 'ticker', label: 'Ticker', value: r => r.ticker,
        render: r => `<a class="tk" href="#/company/${esc(r.ticker)}">${esc(r.ticker)}</a>${deep.has(r.ticker) ? ' <span class="star" title="Deep dive available">★</span>' : ''}${r.stale ? ` <span class="stale" title="Couldn't refresh last run; showing data from ${esc(r.updated)}">stale</span>` : ''}` },
      { key: 'name', label: 'Company', value: r => r.name, cls: 'wide',
        render: r => `<span class="name">${esc(r.name)}</span><span class="sub">${esc(r.industry)}</span>` },
      ...keys.map(k => ({ key: k, label: fields[k].label, term: k, cls: 'num', value: r => r[k], render: r => byFmt(fields[k].fmt, r[k]) })),
    ];
    rows = sortRows(rows, cols, state.sort.key, state.sort.desc);
    $('#count').textContent = `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'}`;
    const shown = showAll ? rows : rows.slice(0, PAGE);
    const more = rows.length > shown.length
      ? `<div class="more"><button class="btn ghost" id="show-all" type="button">Show all ${rows.length.toLocaleString()}</button></div>` : '';
    $('#results').innerHTML = rows.length
      ? table(cols, shown, { sortKey: state.sort.key, sortDesc: state.sort.desc, rowAttrs: r => `data-href="#/company/${esc(r.ticker)}"` }) + more
      : '<p class="empty">Nothing passes every filter. Loosen one.</p>';
    wireSort($('#results'), key => {
      state.sort = { key, desc: key === state.sort.key ? !state.sort.desc : !['ticker', 'name'].includes(key) };
      saveUrl(); drawResults();
    });
    wireRowLinks($('#results'));
    $('#show-all')?.addEventListener('click', () => { showAll = true; drawResults(); });
    $('#export').onclick = () => {
      const header = cols.map(c => c.key === 'name' ? 'name,sector,industry' : c.key).join(',');
      const lines = rows.map(r => cols.map(c => c.key === 'name'
        ? [r.name, r.sector, r.industry].map(csvCell).join(',') : csvCell(r[c.key])).join(','));
      download(`screen-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines].join('\n'));
    };
  };

  const changed = ({ controls = false } = {}) => {
    state.preset = undefined;  // any edit turns a preset into a custom screen
    if (controls) drawControls(); else $('#preset').value = '';
    saveUrl(); drawResults();
  };

  // Events (delegated, so they survive control re-renders).
  $('#preset').addEventListener('change', e => {
    const p = meta.screens.find(s => s.id === e.target.value);
    state = p ? { preset: p.id, filters: structuredClone(p.filters), sort: p.sort || state.sort, q: state.q }
              : { ...state, preset: undefined };
    drawControls(); saveUrl(); drawResults();
  });
  let t;
  $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; saveUrl(); drawResults(); }, 150); });
  $('#reset').addEventListener('click', () => { state = { filters: {}, sort: { key: 'mcap', desc: true }, q: '' }; $('#q').value = ''; drawControls(); saveUrl(); drawResults(); });
  $('#add').addEventListener('change', e => {
    const k = e.target.value;
    e.target.value = '';
    if (!k || state.filters[k]) return;
    state.filters[k] = {};
    changed({ controls: true });
    root.querySelector(`.num-filter[data-key="${CSS.escape(k)}"] input`)?.focus();
  });
  root.querySelector('.filters').addEventListener('click', e => {
    const chip = e.target.closest('button.toggle');
    const rm = e.target.closest('[data-remove]');
    if (rm) { delete state.filters[rm.dataset.remove]; changed({ controls: true }); return; }
    if (!chip) return;
    const { key, val } = chip.dataset;
    if (key === 'sector') delete state.filters.industry;  // industry list depends on sector
    const cur = new Set((state.filters[key] || []).map(String));
    cur.has(val) ? cur.delete(val) : cur.add(val);
    if (cur.size) state.filters[key] = [...cur]; else delete state.filters[key];
    changed({ controls: true });
  });
  $('#industry').addEventListener('change', e => {
    if (e.target.value) state.filters.industry = [e.target.value]; else delete state.filters.industry;
    changed({ controls: true });
  });
  let t2;
  $('#numeric').addEventListener('input', e => {
    const inp = e.target.closest('input[data-bound]');
    if (!inp) return;
    const key = inp.closest('.num-filter').dataset.key;
    state.filters[key][inp.dataset.bound] = fromInput(fields[key].fmt, inp.value);
    clearTimeout(t2); t2 = setTimeout(() => changed(), 250);
  });

  drawControls();
  drawResults();
}
