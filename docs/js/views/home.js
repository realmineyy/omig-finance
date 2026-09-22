// Home: the best ideas in the S&P 500, then the best idea in each GICS sector
// (OMIG must hold every sector), then the full models already built.
import { loadIndex, loadMeta, loadUniverse } from '../data.js';
import { ago, dateShort, mult, pct, price } from '../format.js';
import { actionsPage } from '../github.js';
import { esc, info, label, sortRows, table, upside, wireRowLinks, wireSort } from '../ui.js';

const TOP_IDEAS = 15;

export async function renderHome(root) {
  const [meta, index, universe] = await Promise.all([loadMeta(), loadIndex(), loadUniverse()]);
  const deep = new Set(index.companies.map(c => c.ticker));
  const rows = universe.rows;
  // "Idea" = a credible valuation; the board only leads with the undervalued ones.
  const ideas = rows.filter(r => r.idea && r.upside > 0).sort((a, b) => b.upside - a.upside);
  const sectors = meta.sectors || [...new Set(rows.map(r => r.sector))].sort();
  const covered = sectors.filter(s => ideas.some(r => r.sector === s));
  const star = t => deep.has(t) ? ' <span class="star" title="Full model built">★</span>' : '';

  const ideaCols = [
    { key: 'ticker', label: 'Ticker', value: r => r.ticker,
      render: r => `<a class="tk" href="#/company/${esc(r.ticker)}">${esc(r.ticker)}</a>${star(r.ticker)}` },
    { key: 'name', label: 'Company', value: r => r.name, cls: 'wide',
      render: r => `<span class="name">${esc(r.name)}</span><span class="sub">${esc(r.sector)}</span>` },
    { key: 'price', label: 'Price', term: 'price', cls: 'num', value: r => r.price, render: r => price(r.price) },
    { key: 'fv', label: 'Fair value', term: 'fv', cls: 'num', value: r => r.fv, render: r => price(r.fv) },
    { key: 'upside', label: 'Upside', term: 'upside', cls: 'num', value: r => r.upside, render: r => upside(r.upside) },
    { key: 'fv_dcf', label: 'Quick DCF', term: 'fv_dcf', cls: 'num', value: r => r.fv_dcf, render: r => price(r.fv_dcf) },
    { key: 'fv_comps', label: 'Comps', term: 'fv_comps', cls: 'num', value: r => r.fv_comps, render: r => price(r.fv_comps) },
    { key: 'spread', label: 'Agreement', term: 'spread', cls: 'num', value: r => r.spread,
      render: r => r.spread == null ? '<span class="muted">—</span>' : agreement(r.spread, r.fv_dcf == null) },
    { key: 'fcf_yield', label: 'FCF yield', term: 'fcf_yield', cls: 'num', value: r => r.fcf_yield, render: r => pct(r.fcf_yield) },
    { key: 'pe', label: 'P/E', term: 'pe', cls: 'num', value: r => r.pe, render: r => mult(r.pe) },
  ];
  let sortKey = 'upside', sortDesc = true, showAll = false;

  root.innerHTML = `
    <section class="page-head">
      <div><h1>Best ideas</h1>
        <p class="muted">S&amp;P 500 only · ${dateShort(meta.built_at)} · Ranked by fair value vs. price</p></div>
    </section>

    <section class="tiles">
      <div class="tile"><span class="tile-label">Universe</span><span class="tile-value">${rows.length}</span>
        <span class="tile-sub">S&amp;P 500 names valued nightly</span></div>
      <div class="tile"><span class="tile-label">${label('Undervalued ideas', 'idea_filter')}</span><span class="tile-value">${ideas.length}</span>
        <span class="tile-sub">of ${rows.length} screened</span></div>
      <div class="tile"><span class="tile-label">${label('Sector coverage', 'sector_rule')}</span><span class="tile-value">${covered.length} / ${sectors.length}</span>
        <span class="tile-sub">sectors with a live idea</span></div>
      <div class="tile"><span class="tile-label">${label('10Y Treasury', 'risk_free')}</span><span class="tile-value">${pct(meta.macro.risk_free_rate, 2)}</span>
        <span class="tile-sub">discount-rate base</span></div>
    </section>

    <section class="card">
      <div class="card-head row">
        <div><h2>Top ideas ${info('fv')}</h2>
          <p class="muted">Fair value = average of a quick DCF and peer comps. A screening tool, not a pitch:
            open a name and run the full model before you take it to the club.</p></div>
      </div>
      <div id="ideas"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Best idea by sector ${info('sector_rule')}</h2>
        <p class="muted">OMIG has to hold every sector, so here is the strongest candidate in each one.</p></div>
      <div class="sector-grid">
        ${sectors.map(s => sectorCard(s, ideas.filter(r => r.sector === s), rows, star)).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Full models ${info('dcf')}</h2>
        <p class="muted">Statements, editable DCF, comps and football field. Built for the watchlist,
          the top ideas in each sector, and anything you request.</p></div>
      <div id="research-table"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Saved screens</h2>
        <p class="muted">Defined in <code>config.yaml</code>. Leaders from each get a full model every night.</p></div>
      <div class="screen-grid">
        ${meta.screens.map(s => `
          <a class="screen-card" href="#/screener?preset=${esc(s.id)}">
            <strong>${esc(s.name)}</strong>
            <span class="muted">${esc(s.description || '')}</span>
          </a>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Look up a company</h2></div>
      <form class="lookup" id="lookup">
        <input id="lookup-input" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false"
               placeholder="Ticker, e.g. NVDA" aria-label="Ticker">
        <button class="btn" type="submit">Open</button>
      </form>
      <p class="muted small">Any S&amp;P 500 name opens with its valuation. <b>Run deep dive</b> on the page builds the
        full model in a few minutes.${actionsPage() ? ` (<a href="${esc(actionsPage())}" target="_blank" rel="noopener">workflow runs ↗</a>)` : ''}</p>
    </section>`;

  const drawIdeas = () => {
    const el = root.querySelector('#ideas');
    const sorted = sortRows(ideas, ideaCols, sortKey, sortDesc);
    const shown = showAll ? sorted : sorted.slice(0, TOP_IDEAS);
    el.innerHTML = ideas.length
      ? table(ideaCols, shown, { sortKey, sortDesc, rowAttrs: r => `data-href="#/company/${esc(r.ticker)}"` }) +
        (sorted.length > shown.length
          ? `<div class="more"><button class="btn ghost" id="show-all" type="button">Show all ${sorted.length}</button></div>` : '')
      : '<p class="empty">No name currently clears the quality and agreement filters.</p>';
    wireSort(el, key => { sortDesc = key === sortKey ? !sortDesc : true; sortKey = key; drawIdeas(); });
    wireRowLinks(el);
    el.querySelector('#show-all')?.addEventListener('click', () => { showAll = true; drawIdeas(); });
  };
  drawIdeas();

  // Full models already built
  const screenNames = Object.fromEntries(meta.screens.map(s => [s.id, s.name]));
  const reasonChip = r => r === 'watchlist' ? '<span class="chip chip-strong">Watchlist</span>'
    : r === 'requested' ? '<span class="chip">Requested</span>'
    : r === 'top_idea' ? '<span class="chip">Top idea</span>'
    : `<a class="chip" href="#/screener?preset=${esc(r)}">${esc(screenNames[r] || r)}</a>`;
  const byTicker = Object.fromEntries(rows.map(r => [r.ticker, r]));
  const models = index.companies.map(c => {
    const vals = [c.dcf_perp, c.dcf_exit, c.comps_mid].filter(v => v != null && v > 0);
    const blended = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...c, blended, sector: byTicker[c.ticker]?.sector || c.sector };
  });
  const modelCols = [
    { key: 'ticker', label: 'Ticker', value: r => r.ticker,
      render: r => `<a href="#/company/${esc(r.ticker)}" class="tk">${esc(r.ticker)}</a>${r.flagged ? ' <span class="flag" title="Model warnings">!</span>' : ''}` },
    { key: 'name', label: 'Company', value: r => r.name, cls: 'wide',
      render: r => `<span class="name">${esc(r.name)}</span><span class="sub">${esc(r.sector)}</span>` },
    { key: 'price', label: 'Price', term: 'price', cls: 'num', value: r => r.price, render: r => price(r.price) },
    { key: 'dcf_perp', label: 'DCF (perp.)', term: 'perpetuity', cls: 'num', value: r => r.dcf_perp, render: r => price(r.dcf_perp) },
    { key: 'dcf_exit', label: 'DCF (exit)', term: 'exit', cls: 'num', value: r => r.dcf_exit, render: r => price(r.dcf_exit) },
    { key: 'comps_mid', label: 'Comps', term: 'comps', cls: 'num', value: r => r.comps_mid, render: r => price(r.comps_mid) },
    { key: 'blended', label: 'Blended upside', term: 'blended', cls: 'num',
      value: r => r.blended != null ? r.blended / r.price - 1 : null,
      render: r => upside(r.blended != null ? r.blended / r.price - 1 : null) },
    { key: 'reasons', label: 'Why it\'s here', render: r => r.reasons.map(reasonChip).join(' ') },
    { key: 'as_of', label: 'Updated', cls: 'num', value: r => r.as_of,
      render: r => `<span class="muted" title="${esc(r.as_of)}">${ago(r.as_of)}</span>` },
  ];
  let mKey = 'blended', mDesc = true;
  const drawModels = () => {
    const el = root.querySelector('#research-table');
    el.innerHTML = models.length
      ? table(modelCols, sortRows(models, modelCols, mKey, mDesc), { sortKey: mKey, sortDesc: mDesc, rowAttrs: r => `data-href="#/company/${esc(r.ticker)}"` })
      : '<p class="empty">No full models yet. Run the refresh workflow once.</p>';
    wireSort(el, key => { mDesc = key === mKey ? !mDesc : true; mKey = key; drawModels(); });
    wireRowLinks(el);
  };
  drawModels();

  root.querySelector('#lookup').addEventListener('submit', e => {
    e.preventDefault();
    const t = root.querySelector('#lookup-input').value.trim().toUpperCase().replace('.', '-');
    if (t) location.hash = `#/company/${t}`;
  });
}

/** How well the methods agree, worded rather than left as a raw number. */
function agreement(spread, compsOnly = false) {
  const word = spread <= 0.15 ? 'close' : spread <= 0.3 ? 'fair' : 'wide';
  return `<span class="agree ${word}">${pct(spread, 0)} <span class="muted">${compsOnly ? 'multiples' : word}</span></span>`;
}

function sectorCard(sector, sectorIdeas, rows, star) {
  const count = rows.filter(r => r.sector === sector).length;
  const link = `#/screener?s=${encodeURIComponent(JSON.stringify({ filters: { sector: [sector] }, sort: { key: 'upside', desc: true }, q: '' }))}`;
  const [top, ...rest] = sectorIdeas;
  return `<div class="sector-card${top ? '' : ' empty-sector'}">
    <div class="sector-head"><span class="sector-name">${esc(sector)}</span>
      <a class="muted small" href="${link}">${count} names →</a></div>
    ${top ? `
      <a class="sector-pick" href="#/company/${esc(top.ticker)}">
        <span class="tk">${esc(top.ticker)}</span>${star(top.ticker)}
        <span class="sector-upside">${upside(top.upside)}</span>
      </a>
      <div class="sector-name-full">${esc(top.name)}</div>
      <div class="muted small">${price(top.price)} → ${price(top.fv)} fair value</div>
      ${rest.length ? `<div class="sector-runners muted small">Next: ${rest.slice(0, 2).map(r =>
        `<a href="#/company/${esc(r.ticker)}">${esc(r.ticker)}</a> ${pct(r.upside, 0)}`).join(' · ')}</div>` : ''}`
    : `<p class="muted small">Nothing clears the filters right now. Open the sector to screen it by hand —
        you still need a position here.</p>`}
  </div>`;
}
