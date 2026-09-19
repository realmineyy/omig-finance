// Dependency-free SVG charts: line (crosshair tooltip), grouped columns, football field.
// Colors come from CSS custom properties (--s1.. --s3, --grid, --axis, --ink-*) so
// light/dark themes swap in one place. Charts re-render on container resize.
import { esc } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toPrecision(12));
  return ticks;
}

function svgEl(w, h) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('role', 'img');
  return svg;
}

function add(parent, tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** Re-render on resize; returns the render function. */
function responsive(el, render) {
  let lastW = 0;
  const run = () => {
    const w = Math.floor(el.clientWidth);
    if (w && w !== lastW) { lastW = w; render(w); }
  };
  new ResizeObserver(run).observe(el);
  run();
}

function legend(series, kind) {
  if (series.length < 2) return '';
  return `<div class="legend">${series.map((s, i) =>
    `<span class="key"><i class="swatch ${kind}" style="--c:${SERIES[i]}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function tooltip(el) {
  let tip = el.querySelector('.tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    el.appendChild(tip);
  }
  return tip;
}

function placeTip(el, tip, x, y) {
  tip.hidden = false;
  const w = tip.offsetWidth, cw = el.clientWidth;
  tip.style.left = `${Math.min(Math.max(0, x + 12), cw - w)}px`;
  tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
}

// Tooltip rows: the value leads, the series name follows; keyed with a short line.
const tipRow = (color, value, name) =>
  `<div class="tip-row"><i class="tip-key" style="--c:${color}"></i><b>${esc(value)}</b><span>${esc(name)}</span></div>`;

// ─── Line chart ───────────────────────────────────────────────────────────────
/**
 * series: [{ name, values: [y...] }] sharing one x array.
 * x: [Date|string...], fmtY(v), fmtX(x) for tooltip header, area: wash under a single series.
 */
export function lineChart(el, { x, series, fmtY, fmtX = String, height = 240, area = false, tickX }) {
  el.classList.add('chart');
  el.innerHTML = `${legend(series, 'line')}<div class="plot"></div>`;
  const plot = el.querySelector('.plot');
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (!all.length) { plot.innerHTML = '<p class="muted">No data</p>'; return; }

  responsive(plot, W => {
    const m = { l: 52, r: 12, t: 10, b: 26 };
    const H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const sx = i => m.l + (x.length === 1 ? iw / 2 : (i / (x.length - 1)) * iw);
    const sy = v => m.t + ih - ((v - y0) / (y1 - y0)) * ih;

    const svg = svgEl(W, H);
    for (const t of ticks) {
      add(svg, 'line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), class: t === 0 ? 'axis' : 'grid' });
      add(svg, 'text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' }, fmtY(t));
    }
    const xt = tickX ? tickX(x) : x.map((_, i) => i);
    for (const i of xt) add(svg, 'text', { x: sx(i), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, fmtX(x[i], true));

    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => v == null ? null : [sx(i), sy(v)]);
      const d = pts.reduce((acc, p, i) => !p ? acc : acc + `${acc && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`, '');
      if (area && series.length === 1) {
        const valid = pts.filter(Boolean);
        add(svg, 'path', { d: `${d}L${valid.at(-1)[0]},${sy(y0)}L${valid[0][0]},${sy(y0)}Z`, fill: SERIES[k], 'fill-opacity': 0.1 });
      }
      add(svg, 'path', { d, fill: 'none', stroke: SERIES[k], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (x.length <= 12) pts.forEach(p => p && add(svg, 'circle', { cx: p[0], cy: p[1], r: 4, fill: SERIES[k], class: 'dot' }));
    });

    const cross = add(svg, 'line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
    const marks = series.map((_, k) => add(svg, 'circle', { r: 4, fill: SERIES[k], class: 'dot', visibility: 'hidden' }));
    const hit = add(svg, 'rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', tabindex: 0 });
    svg.setAttribute('aria-label', series.map(s => s.name).join(', '));
    plot.replaceChildren(svg);
    const tip = tooltip(plot);

    const show = i => {
      cross.setAttribute('x1', sx(i)); cross.setAttribute('x2', sx(i)); cross.setAttribute('visibility', 'visible');
      series.forEach((s, k) => {
        const v = s.values[i];
        marks[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
        if (v != null) { marks[k].setAttribute('cx', sx(i)); marks[k].setAttribute('cy', sy(v)); }
      });
      tip.innerHTML = `<div class="tip-head">${esc(fmtX(x[i]))}</div>` +
        series.map((s, k) => tipRow(SERIES[k], s.values[i] == null ? '—' : fmtY(s.values[i]), s.name)).join('');
      const vals = series.map(s => s.values[i]).filter(v => v != null);
      placeTip(plot, tip, sx(i), sy(Math.max(...vals)));
    };
    const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); marks.forEach(mk => mk.setAttribute('visibility', 'hidden')); };
    let idx = x.length - 1;
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      idx = Math.round(((e.clientX - r.left) * (W / r.width) - m.l) / iw * (x.length - 1));
      show(Math.max(0, Math.min(x.length - 1, idx)));
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => show(idx));
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
      else if (e.key === 'ArrowRight') idx = Math.min(x.length - 1, idx + 1);
      else return;
      e.preventDefault(); show(idx);
    });
  });
}

// ─── Grouped column chart ─────────────────────────────────────────────────────
function columnPath(x, w, yBase, yVal, r = 4) {
  // 4px rounded data-end, square at the baseline; handles negative columns.
  const up = yVal <= yBase;
  const h = Math.abs(yBase - yVal);
  r = Math.min(r, h, w / 2);
  if (up) return `M${x},${yBase}V${yVal + r}Q${x},${yVal} ${x + r},${yVal}H${x + w - r}Q${x + w},${yVal} ${x + w},${yVal + r}V${yBase}Z`;
  return `M${x},${yBase}V${yVal - r}Q${x},${yVal} ${x + r},${yVal}H${x + w - r}Q${x + w},${yVal} ${x + w},${yVal - r}V${yBase}Z`;
}

export function columnChart(el, { categories, series, fmtY, height = 220 }) {
  el.classList.add('chart');
  el.innerHTML = `${legend(series, 'rect')}<div class="plot"></div>`;
  const plot = el.querySelector('.plot');
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (!all.length) { plot.innerHTML = '<p class="muted">No data</p>'; return; }

  responsive(plot, W => {
    const m = { l: 56, r: 8, t: 10, b: 26 };
    const H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
    const y0 = ticks[0], y1 = ticks.at(-1);
    const sy = v => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const band = iw / categories.length;
    const gap = 2, n = series.length;
    const bw = Math.min(24, (band * 0.7 - gap * (n - 1)) / n);
    const groupW = bw * n + gap * (n - 1);

    const svg = svgEl(W, H);
    for (const t of ticks) {
      add(svg, 'line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), class: t === 0 ? 'axis' : 'grid' });
      add(svg, 'text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' }, fmtY(t));
    }
    const tip = tooltip(plot);
    categories.forEach((c, i) => {
      const gx = m.l + band * i + (band - groupW) / 2;
      add(svg, 'text', { x: m.l + band * i + band / 2, y: H - 6, 'text-anchor': 'middle', class: 'tick' }, c);
      series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) return;
        const x = gx + k * (bw + gap);
        const bar = add(svg, 'path', { d: columnPath(x, bw, sy(0), sy(v)), fill: SERIES[k], class: 'bar' });
        // Hit target is the full band slot, bigger than the painted column.
        const hit = add(svg, 'rect', { x: x - gap / 2, y: m.t, width: bw + gap, height: ih, fill: 'transparent', tabindex: 0 });
        const show = () => {
          bar.classList.add('hover');
          tip.innerHTML = `<div class="tip-head">${esc(c)}</div>${tipRow(SERIES[k], fmtY(v), s.name)}`;
          placeTip(plot, tip, x + bw / 2, Math.min(sy(v), sy(0)));
        };
        const hide = () => { bar.classList.remove('hover'); tip.hidden = true; };
        hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
      });
    });
    plot.replaceChildren(svg, tip);
  });
}

// ─── Football field ───────────────────────────────────────────────────────────
/**
 * rows: [{ label, low, mid?, high, group }], current: price line, fmt: value formatter.
 * One hue for every bar (it's one measure); groups are separated by space + a label.
 */
export function footballField(el, { rows, current, fmt }) {
  el.classList.add('chart');
  el.innerHTML = '<div class="plot"></div>';
  const plot = el.querySelector('.plot');
  rows = rows.filter(r => r.low != null && r.high != null && Number.isFinite(r.low) && Number.isFinite(r.high));
  if (!rows.length) { plot.innerHTML = '<p class="muted">Not enough data for a valuation range.</p>'; return; }

  responsive(plot, W => {
    const labelW = Math.min(150, Math.round(W * 0.36));
    const m = { l: labelW, r: 44, t: 26, b: 24 };
    const rowH = 30, groupGap = 12;
    const groups = [...new Set(rows.map(r => r.group))];
    const H = m.t + m.b + rows.length * rowH + (groups.length - 1) * groupGap;
    const iw = W - m.l - m.r;
    // Cap the axis so one outlier method can't squash the rest; clipped bars get a ›.
    const cap = current ? current * 2.5 : Infinity;
    const vals = rows.flatMap(r => [Math.min(r.low, cap), Math.min(r.high, cap)]).concat(current ?? []);
    const ticks = niceTicks(Math.max(0, Math.min(...vals) * 0.9), Math.max(...vals) * 1.05, W < 500 ? 3 : 5);
    const x0 = ticks[0], x1 = ticks.at(-1);
    const sx = v => m.l + ((v - x0) / (x1 - x0)) * iw;

    const svg = svgEl(W, H);
    svg.setAttribute('aria-label', 'Football field: valuation ranges by method');
    for (const t of ticks) {
      add(svg, 'line', { x1: sx(t), x2: sx(t), y1: m.t - 4, y2: H - m.b, class: 'grid' });
      add(svg, 'text', { x: sx(t), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, fmt(t));
    }
    const tip = tooltip(plot);
    let y = m.t, prevGroup = rows[0].group;
    rows.forEach(r => {
      if (r.group !== prevGroup) { y += groupGap; prevGroup = r.group; }
      const cy = y + rowH / 2, bh = 16;
      add(svg, 'text', { x: 0, y: cy + 4, class: 'ff-label' }, r.label);
      const clipped = r.high > cap;
      const xl = sx(Math.min(r.low, cap)), xh = Math.max(sx(Math.min(r.high, cap)), xl + 3);
      const bar = add(svg, 'rect', { x: xl, y: cy - bh / 2, width: xh - xl, height: bh, rx: 4, fill: 'var(--s1)', class: 'bar' });
      if (r.mid != null && r.mid <= cap) add(svg, 'line', { x1: sx(r.mid), x2: sx(r.mid), y1: cy - bh / 2, y2: cy + bh / 2, class: 'ff-mid' });
      if (W >= 420) {
        add(svg, 'text', { x: xl - 5, y: cy + 4, 'text-anchor': 'end', class: 'ff-val' }, fmt(r.low));
        add(svg, 'text', { x: xh + 5, y: cy + 4, class: 'ff-val' }, `${fmt(r.high)}${clipped ? ' ›' : ''}`);
      } else if (clipped) {
        add(svg, 'text', { x: xh + 4, y: cy + 4, class: 'ff-val' }, '›');
      }
      const hit = add(svg, 'rect', { x: 0, y, width: W, height: rowH, fill: 'transparent', tabindex: 0 });
      const show = () => {
        bar.classList.add('hover');
        tip.innerHTML = `<div class="tip-head">${esc(r.label)}</div>` +
          `<div class="tip-row"><b>${esc(fmt(r.low))} – ${esc(fmt(r.high))}</b><span>range</span></div>` +
          (r.mid != null ? `<div class="tip-row"><b>${esc(fmt(r.mid))}</b><span>${esc(r.midLabel || 'midpoint')}</span></div>` : '') +
          (r.note ? `<div class="tip-note">${esc(r.note)}</div>` : '');
        placeTip(plot, tip, sx(r.mid ?? (r.low + r.high) / 2), cy - bh / 2);
      };
      const hide = () => { bar.classList.remove('hover'); tip.hidden = true; };
      hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
      y += rowH;
    });
    if (current != null) {
      const cx = sx(current);
      add(svg, 'line', { x1: cx, x2: cx, y1: m.t - 6, y2: H - m.b, class: 'ff-price' });
      add(svg, 'text', { x: Math.min(Math.max(cx, m.l + 40), W - 40), y: 14, 'text-anchor': 'middle', class: 'ff-price-label' },
        `Current ${fmt(current)}`);
    }
    plot.replaceChildren(svg, tip);
    if (rows.some(r => r.high > cap)) {
      const note = document.createElement('p');
      note.className = 'muted small';
      note.textContent = 'Bars marked › run past the axis (more than 2.5× today\'s price). Hover for the full range.';
      plot.appendChild(note);
    }
  });
}
