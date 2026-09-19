// Home: research list (every deep-dived company) + saved screens.
import { loadIndex, loadMeta, loadUniverse } from '../data.js';
import { ago, dateShort, pct, price } from '../format.js';
import { actionsPage } from '../github.js';
import { esc, info, label, sortRows, table, upside, wireRowLinks, wireSort } from '../ui.js';
import { matches } from './screener.js';

const blended = c => {
  const v = [c.dcf_perp, c.dcf_exit, c.comps_mid].filter(x => x != null && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export async function renderHome(root) {
  const [meta, index, universe] = await Promise.all([loadMeta(), loadIndex(), loadUniverse()]);
  const screenNames = Object.fromEntries(meta.screens.map(s => [s.id, s.name]));
  const reasonChip = r => r === 'watchlist' ? '<span class="chip chip-strong">Watchlist</span>'
    : r === 'requested' ? '<span class="chip">Requested</span>'
    : `<a class="chip" href="#/screener?preset=${esc(r)}">${esc(screenNames[r] || r)}</a>`;

  const rows = index.companies.map(c => ({ ...c, blended: blended(c) }));
  const cols = [
    { key: 'ticker', label: 'Ticker', render: r => `<a href="#/company/${esc(r.ticker)}" class="tk">${esc(r.ticker)}</a>${r.flagged ? ' <span class="flag" title="Has model warnings">!</span>' : ''}`, value: r => r.ticker },
    { key: 'name', label: 'Company', render: r => `<span class="name">${esc(r.name)}</span><span class="sub">${esc(r.sector)}</span>`, value: r => r.name, cls: 'wide' },
    { key: 'price', label: 'Price', term: 'price', render: r => price(r.price), value: r => r.price, cls: 'num' },
    { key: 'dcf_perp', label: 'DCF (perp.)', term: 'perpetuity', render: r => price(r.dcf_perp), value: r => r.dcf_perp, cls: 'num' },
    { key: 'dcf_exit', label: 'DCF (exit)', term: 'exit', render: r => price(r.dcf_exit), value: r => r.dcf_exit, cls: 'num' },
    { key: 'comps_mid', label: 'Comps', term: 'comps', render: r => price(r.comps_mid), value: r => r.comps_mid, cls: 'num' },
    { key: 'street', label: 'Street', term: 'street', render: r => price(r.street), value: r => r.street, cls: 'num' },
    { key: 'upside', label: 'Blended upside', term: 'blended', render: r => upside(r.blended != null ? r.blended / r.price - 1 : null), value: r => r.blended != null ? r.blended / r.price - 1 : null, cls: 'num' },
    { key: 'reasons', label: 'Why it\'s here', render: r => r.reasons.map(reasonChip).join(' ') },
    { key: 'as_of', label: 'Updated', render: r => `<span class="muted" title="${esc(r.as_of)}">${ago(r.as_of)}</span>`, value: r => r.as_of, cls: 'num' },
  ];
  let sortKey = 'upside', sortDesc = true;

  const counts = meta.screens.map(s => universe.rows.filter(r => matches(r, s.filters)).length);
  const actions = actionsPage();

  root.innerHTML = `
    <section class="page-head">
      <div><h1>Research dashboard</h1>
        <p class="muted">Data as of ${dateShort(meta.built_at)} · Rebuilt every weekday after the close</p></div>
    </section>

    <section class="tiles">
      <div class="tile"><span class="tile-label">Universe</span><span class="tile-value">${meta.universe_size.toLocaleString()}</span><span class="tile-sub">${esc(meta.exchanges.join(' + '))} listed stocks</span></div>
      <div class="tile"><span class="tile-label">Deep dives</span><span class="tile-value">${rows.length}</span><span class="tile-sub">DCF + comps built</span></div>
      <div class="tile"><span class="tile-label">${label('10Y Treasury', 'risk_free')}</span><span class="tile-value">${pct(meta.macro.risk_free_rate, 2)}</span><span class="tile-sub">Risk-free rate in every DCF</span></div>
      <div class="tile"><span class="tile-label">${label('Equity risk premium', 'erp')}</span><span class="tile-value">${pct(meta.macro.equity_risk_premium, 1)}</span><span class="tile-sub">Terminal growth ${pct(meta.macro.terminal_growth, 1)}</span></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Research list ${info('blended')}</h2>
        <p class="muted">Every company with a full deep dive. Click a row for the model.</p>
      </div>
      <div id="research-table"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Saved screens</h2>
        <p class="muted">Defined in <code>config.yaml</code>. The top names from each get a deep dive every night.</p></div>
      <div class="screen-grid">
        ${meta.screens.map((s, i) => `
          <a class="screen-card" href="#/screener?preset=${esc(s.id)}">
            <span class="screen-count">${counts[i]}</span>
            <strong>${esc(s.name)}</strong>
            <span class="muted">${esc(s.description || '')}</span>
          </a>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Deep-dive a new ticker</h2></div>
      <form class="lookup" id="lookup">
        <input id="lookup-input" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Ticker, e.g. NVDA" aria-label="Ticker">
        <button class="btn" type="submit">Open</button>
      </form>
      <p class="muted small">Any NYSE or Nasdaq stock opens instantly with screener data. Hit <b>Run deep dive</b> on its page for the
        full model. It takes a few minutes and the company stays in your research list, refreshed weekly.
        ${actions ? `(Workflow runs: <a href="${esc(actions)}" target="_blank" rel="noopener">GitHub Actions ↗</a>)` : ''}</p>
    </section>`;

  const draw = () => {
    const el = root.querySelector('#research-table');
    el.innerHTML = rows.length
      ? table(cols, sortRows(rows, cols, sortKey, sortDesc), { sortKey, sortDesc, rowAttrs: r => `data-href="#/company/${esc(r.ticker)}"` })
      : '<p class="empty">No deep dives yet. Add tickers to the watchlist in config.yaml and run the build.</p>';
    wireSort(el, key => { sortDesc = key === sortKey ? !sortDesc : true; sortKey = key; draw(); });
    wireRowLinks(el);
  };
  draw();

  root.querySelector('#lookup').addEventListener('submit', e => {
    e.preventDefault();
    const t = root.querySelector('#lookup-input').value.trim().toUpperCase().replace('.', '-');
    if (t) location.hash = `#/company/${t}`;
  });
}
