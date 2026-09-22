// Hash router: #/ (home), #/screener?..., #/company/TICKER
import { loadMeta } from './data.js';
import { ago, dateShort } from './format.js';
import { openSettings } from './deepdive.js';
import { esc, installPopover } from './ui.js';
import { renderCompany } from './views/company.js';
import { renderHolder } from './views/holder.js';
import { renderHome } from './views/home.js';
import { renderScreener } from './views/screener.js';

const root = document.getElementById('main');

async function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  document.querySelectorAll('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === (parts[0] || 'home') ? 'page' : 'false'));
  root.setAttribute('aria-busy', 'true');
  try {
    if (parts[0] === 'screener') await renderScreener(root, params);
    else if (parts[0] === 'company' && parts[1]) await renderCompany(root, decodeURIComponent(parts[1]));
    else if (parts[0] === 'holder' && parts[1]) await renderHolder(root, decodeURIComponent(parts[1]));
    else await renderHome(root);
    const h1 = root.querySelector('h1');
    document.title = h1 ? `${h1.textContent.trim()} · OMIG Research` : 'OMIG Research';
  } catch (err) {
    console.error(err);
    root.innerHTML = `<section class="card"><h1>Couldn't load data</h1>
      <p>${esc(err.message)}</p><p class="muted">If this is a fresh setup, run <code>python -m engine.build</code> first.</p></section>`;
  } finally {
    root.removeAttribute('aria-busy');
  }
}

let lastPath = null;
window.addEventListener('hashchange', () => {
  // Only scroll to top when moving between pages, not on in-page state changes.
  const p = location.hash.split('?')[0];
  if (p !== lastPath) window.scrollTo(0, 0);
  lastPath = p;
  route();
});

// Theme toggle: remembers the viewer's choice; otherwise follows the OS.
const themeBtn = document.getElementById('theme');
const applyTheme = t => {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  themeBtn.textContent = dark ? '☀' : '☾';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
};
let saved = null;
try { saved = localStorage.getItem('er:theme'); } catch { /* storage blocked */ }
applyTheme(saved);
themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  try { localStorage.setItem('er:theme', next); } catch { /* storage blocked */ }
  applyTheme(next);
});

installPopover();
document.getElementById('settings').addEventListener('click', () => openSettings());
window.addEventListener('er:refresh', route);
loadMeta().then(m => {
  document.getElementById('updated').textContent = `Updated ${ago(m.built_at)} (${dateShort(m.built_at)})`;
}).catch(() => {});
lastPath = location.hash.split('?')[0];
route();
