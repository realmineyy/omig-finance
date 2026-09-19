// Loads the JSON the engine writes to docs/data. Cached per page load.
const cache = new Map();

export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`data/${path}`, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw Object.assign(new Error(`${path}: HTTP ${r.status}`), { status: r.status });
      return r.json();
    }).catch(err => { cache.delete(path); throw err; }));
  }
  return cache.get(path);
}

export const loadMeta = () => getJSON('meta.json');
export const loadIndex = () => getJSON('companies/index.json');
export const loadCompany = t => getJSON(`companies/${encodeURIComponent(t)}.json`);

let universe;
export function loadUniverse() {
  universe ??= getJSON('universe.json').then(d => ({
    as_of: d.as_of,
    rows: d.rows.map(r => Object.fromEntries(d.columns.map((c, i) => [c, r[i]]))),
  }));
  return universe;
}
export const loadHolders = () => getJSON('holders.json');
export const invalidate = path => cache.delete(path);
