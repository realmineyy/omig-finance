// Trigger the "Refresh research data" workflow from the browser and follow it
// to completion. Uses a fine-grained GitHub token the viewer pastes once; it's
// kept in this browser's localStorage only and sent only to api.github.com.
const API = 'https://api.github.com';
const WORKFLOW = 'refresh.yml';
const KEYS = { token: 'er:gh-token', repo: 'er:gh-repo' };

const read = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };

/** owner/repo implied by a GitHub Pages URL (you.github.io/repo). */
export function detectedRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return '';
  const name = location.pathname.split('/').filter(Boolean)[0] || `${m[1]}.github.io`;
  return `${m[1]}/${name}`;
}
/** A saved override wins (local dev, custom domains). */
export const repo = () => read(KEYS.repo) || detectedRepo();
export const token = () => read(KEYS.token);
export function saveSettings({ token: t, repo: r }) {
  write(KEYS.token, t?.trim());
  const v = r?.trim();
  write(KEYS.repo, v && v !== detectedRepo() ? v : '');
}
export const isConfigured = () => !!(token() && repo());
export const actionsPage = () => repo() ? `https://github.com/${repo()}/actions/workflows/${WORKFLOW}` : null;

async function gh(path, opts = {}) {
  const res = await fetch(`${API}/repos/${repo()}${path}`, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token()}`,
               'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'GitHub rejected the token (expired or mistyped).'
      : res.status === 403 || res.status === 404 ? 'The token can\'t run workflows on this repo. Check the repo name and that the token has "Actions: Read and write" access.'
      : `GitHub API error ${res.status}.`;
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

// One job per ticker, kept at module level so it survives page navigation.
const jobs = new Map();
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());
export const onJobChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const job = ticker => jobs.get(ticker);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Dispatch a deep dive and follow it: queued -> running -> publishing -> done.
 * `isPublished()` resolves true once the site serves the new data.
 */
export async function runDeepDive(ticker, isPublished) {
  if (jobs.get(ticker)?.active) return;
  const j = { ticker, active: true, state: 'starting', started: Date.now(), url: actionsPage() };
  const set = patch => { Object.assign(j, patch); emit(); };
  jobs.set(ticker, j); emit();
  try {
    const { default_branch: ref } = await gh('');
    const since = new Date(Date.now() - 60_000).toISOString();
    await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST', body: JSON.stringify({ ref, inputs: { tickers: ticker, skip_universe: 'true' } }),
    });
    set({ state: 'queued' });

    // Find the run we just started (the API doesn't return its id).
    let run;
    for (let i = 0; i < 20 && !run; i++) {
      await sleep(3000);
      const { workflow_runs: runs } = await gh(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5&created=${encodeURIComponent(`>=${since}`)}`);
      run = runs.find(r => new Date(r.created_at) >= new Date(j.started - 15_000));
    }
    if (!run) throw new Error('The workflow was dispatched but its run never appeared.');
    set({ url: run.html_url });

    while (run.status !== 'completed') {
      set({ state: run.status === 'in_progress' ? 'running' : 'queued' });
      await sleep(8000);
      run = await gh(`/actions/runs/${run.id}`);
    }
    if (run.conclusion !== 'success') throw new Error(`The run finished with "${run.conclusion}". Open it on GitHub for the log.`);

    // GitHub Pages redeploys after the data commit; wait for the new file.
    set({ state: 'publishing' });
    for (let i = 0; i < 60; i++) {
      if (await isPublished()) return set({ state: 'done', active: false });
      await sleep(5000);
    }
    throw new Error('The data was built but GitHub Pages hasn\'t published it yet. Reload in a minute.');
  } catch (err) {
    set({ state: 'error', error: err.message, active: false });
  }
}
