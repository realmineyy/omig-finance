// Small DOM helpers shared by every view.
import { GLOSSARY } from './glossary.js';
import { signedPct } from './format.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape untrusted text (company names, summaries) before it goes into innerHTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** Only http(s) links from data make it into an href (no javascript: URLs). */
export const safeUrl = u => /^https?:\/\//i.test(String(u ?? '')) ? String(u) : '';

/** The ⓘ button. Renders nothing for terms without a glossary entry. */
export function info(term) {
  const g = GLOSSARY[term];
  if (!g) return '';
  return `<button type="button" class="info" data-term="${esc(term)}" aria-label="What is ${esc(g.title)}?">i</button>`;
}

/** A label followed by its ⓘ button. */
export const label = (text, term) => `<span class="lbl">${esc(text)}${info(term)}</span>`;

/** Upside/downside text: arrow + sign carry direction, so it never relies on color alone. */
export function upside(v) {
  if (v == null || !Number.isFinite(v)) return '<span class="muted">—</span>';
  const cls = v >= 0 ? 'up' : 'down';
  return `<span class="${cls}">${v >= 0 ? '▲' : '▼'} ${signedPct(v)}</span>`;
}

// ─── Glossary popover (one shared element) ────────────────────────────────────
let pop, current;

function closePopover() {
  if (!pop) return;
  pop.hidden = true;
  current?.setAttribute('aria-expanded', 'false');
  current = null;
}

function openPopover(btn) {
  const g = GLOSSARY[btn.dataset.term];
  if (!g) return;
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role', 'dialog');
    document.body.appendChild(pop);
  }
  pop.innerHTML = `
    <div class="pop-head"><strong>${esc(g.title)}</strong>
      <button type="button" class="pop-close" aria-label="Close">×</button></div>
    <p>${esc(g.plain)}</p>
    ${g.formula ? `<p class="pop-formula"><span>How it's calculated</span>${esc(g.formula)}</p>` : ''}
    ${g.pitch ? `<p class="pop-pitch"><span>In a pitch</span>${esc(g.pitch)}</p>` : ''}`;
  pop.hidden = false;
  current = btn;
  btn.setAttribute('aria-expanded', 'true');

  // Phones get a bottom sheet (CSS); wider screens anchor next to the button.
  if (window.innerWidth > 640) {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
  } else {
    pop.style.left = pop.style.top = '';
  }
  pop.querySelector('.pop-close').focus({ preventScroll: true });
}

export function installPopover() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('button.info');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();  // don't also sort the table header it sits in
      if (current === btn) closePopover(); else openPopover(btn);
      return;
    }
    if (e.target.closest('.pop-close') || (pop && !pop.contains(e.target))) closePopover();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const b = current; closePopover(); b?.focus(); } });
  window.addEventListener('hashchange', closePopover);
  window.addEventListener('resize', closePopover);
}

// ─── Sortable tables ──────────────────────────────────────────────────────────
/**
 * cols: [{ key, label, term?, render(row) -> html, value(row) -> sortable, cls? }]
 * Returns html; call wireSort(container, rerender) after insertion.
 */
export function table(cols, rows, { sortKey, sortDesc, rowAttrs = () => '', footer = '' } = {}) {
  const head = cols.map(c => {
    const active = c.key === sortKey;
    const aria = active ? (sortDesc ? 'descending' : 'ascending') : 'none';
    const arrow = active ? (sortDesc ? ' ↓' : ' ↑') : '';
    return `<th class="${c.cls || ''}" aria-sort="${aria}"${c.value ? ` data-sort="${esc(c.key)}" tabindex="0"` : ''}>` +
      `<span class="th-inner">${esc(c.label)}${arrow}${c.term ? info(c.term) : ''}</span></th>`;
  }).join('');
  const body = rows.map(r => `<tr ${rowAttrs(r)}>${cols.map(c => `<td class="${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${footer}</table></div>`;
}

export function sortRows(rows, cols, key, desc) {
  const col = cols.find(c => c.key === key);
  if (!col?.value) return rows;
  return [...rows].sort((a, b) => {
    const va = col.value(a), vb = col.value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;  // missing values always sink
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return desc ? -cmp : cmp;
  });
}

export function wireSort(root, onSort) {
  root.querySelectorAll('th[data-sort]').forEach(th => {
    const go = () => onSort(th.dataset.sort);
    th.addEventListener('click', go);
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

/** Rows that navigate on click (and Enter) without nesting links in every cell. */
export function wireRowLinks(root) {
  root.querySelectorAll('tr[data-href]').forEach(tr => {
    tr.tabIndex = 0;
    tr.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
  });
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
