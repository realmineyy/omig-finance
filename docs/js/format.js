// Number formatting. Every formatter returns an em dash for missing values.
const DASH = '—';
const ok = v => v !== null && v !== undefined && Number.isFinite(v);

export function money(v, digits = 1) {
  if (!ok(v)) return DASH;
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(digits + 1)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits)}M`;
  return `${sign}$${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
export const price = v => ok(v) ? `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : DASH;
export const pct = (v, d = 1) => ok(v) ? `${(v * 100).toFixed(d).replace('-', '−')}%` : DASH;
export const signedPct = (v, d = 1) => ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)}%` : DASH;
export const mult = (v, d = 1) => ok(v) ? `${v.toFixed(d).replace('-', '−')}x` : DASH;
export const num = (v, d = 2) => ok(v) ? v.toFixed(d).replace('-', '−') : DASH;
export const int = v => ok(v) ? Math.round(v).toLocaleString('en-US') : DASH;

/** Format by the field `fmt` codes the engine writes into meta.json. */
export function byFmt(fmt, v) {
  switch (fmt) {
    case 'money': return money(v);
    case 'price': return price(v);
    case 'pct': return pct(v);
    case 'x': return mult(v);
    case 'int': return int(v);
    default: return num(v);
  }
}

/** Screener inputs: percents typed as 15 mean 0.15; money typed in $B. */
export const INPUT_UNITS = { pct: { scale: 100, suffix: '%' }, money: { scale: 1e-9, suffix: '$B' } };
export const toInput = (fmt, v) => v == null ? '' : +(v * (INPUT_UNITS[fmt]?.scale ?? 1)).toPrecision(6);
export const fromInput = (fmt, s) => {
  if (s === '' || s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n / (INPUT_UNITS[fmt]?.scale ?? 1) : null;
};

export function dateShort(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function ago(iso) {
  if (!iso) return DASH;
  const h = (Date.now() - new Date(iso)) / 36e5;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
