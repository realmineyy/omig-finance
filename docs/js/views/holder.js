// Holder page: everything one institution owns across the research list.
import { loadHolders } from '../data.js';
import { money, pct } from '../format.js';
import { esc, info, sortRows, table, upside, wireRowLinks, wireSort } from '../ui.js';

export async function renderHolder(root, name) {
  const { holders } = await loadHolders();
  const rows = holders[name] || [];
  const cols = [
    { key: 'ticker', label: 'Ticker', value: r => r.ticker, render: r => `<a class="tk" href="#/company/${esc(r.ticker)}">${esc(r.ticker)}</a>` },
    { key: 'name', label: 'Company', value: r => r.name, cls: 'wide', render: r => esc(r.name) },
    { key: 'pct', label: '% of company', value: r => r.pct, cls: 'num', render: r => pct(r.pct, 2) },
    { key: 'value', label: 'Position value', value: r => r.value, cls: 'num', render: r => money(r.value) },
    { key: 'pct_change', label: 'Change (qtr)', value: r => r.pct_change, cls: 'num', render: r => upside(r.pct_change) },
  ];
  let sortKey = 'value', sortDesc = true;
  root.innerHTML = `<section class="page-head"><div>
      <h1>${esc(name)}</h1>
      <p class="muted">Top-10 holder positions across your ${rows.length ? 'deep-dived companies' : 'research list'} ${info('top_holders')}</p></div></section>
    <section class="card" id="holdings"></section>`;
  const el = root.querySelector('#holdings');
  const draw = () => {
    el.innerHTML = rows.length ? table(cols, sortRows(rows, cols, sortKey, sortDesc), { sortKey, sortDesc, rowAttrs: r => `data-href="#/company/${esc(r.ticker)}"` })
      : '<p class="empty">This holder isn\'t a top-10 holder of any company in your research list.</p>';
    wireSort(el, k => { sortDesc = k === sortKey ? !sortDesc : true; sortKey = k; draw(); });
    wireRowLinks(el);
  };
  draw();
}
