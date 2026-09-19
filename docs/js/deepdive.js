// "Run deep dive" button + GitHub connection settings.
import * as gh from './github.js';
import { invalidate } from './data.js';
import { esc } from './ui.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Settings dialog. Resolves true if the viewer saved a token. */
export function openSettings() {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'settings';
    dlg.innerHTML = `
      <form method="dialog">
        <h2>Connect GitHub</h2>
        <p>The <b>Run deep dive</b> button starts this site's refresh workflow on GitHub. To do that, this browser needs a
          GitHub token that can <em>only</em> run Actions on this one repository. It's stored in this browser only and sent only to GitHub.</p>
        <ol class="small">
          <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener">new fine-grained token ↗</a></li>
          <li>Name it anything, pick an expiration (90 days is fine).</li>
          <li><b>Repository access</b> → <i>Only select repositories</i> → pick <code>${esc(gh.repo() || 'your research repo')}</code>.</li>
          <li><b>Permissions → Repository → Actions</b> → <i>Read and write</i>. Leave everything else as is.</li>
          <li>Generate, copy, and paste it below.</li>
        </ol>
        <label class="field"><span>Repository (owner/name)</span>
          <input name="repo" type="text" autocomplete="off" spellcheck="false" placeholder="you/equity-research" value="${esc(gh.repo())}"></label>
        <label class="field"><span>Token</span>
          <input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…" value="${esc(gh.token())}"></label>
        <div class="dlg-actions">
          ${gh.token() ? '<button class="btn ghost" value="remove" type="submit">Remove token</button>' : ''}
          <span class="grow"></span>
          <button class="btn ghost" value="cancel" type="submit">Cancel</button>
          <button class="btn" value="save" type="submit">Save</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const f = dlg.querySelector('form');
      if (dlg.returnValue === 'save') gh.saveSettings({ token: f.token.value, repo: f.repo.value });
      if (dlg.returnValue === 'remove') gh.saveSettings({ token: '', repo: f.repo.value });
      dlg.remove();
      resolve(dlg.returnValue === 'save' && gh.isConfigured());
    });
    dlg.showModal();
  });
}

const STATUS = {
  starting: 'Starting…', queued: 'Queued on GitHub…', running: 'Building the deep dive…',
  publishing: 'Publishing to the site…', done: 'Done. Loading the new data…',
};

/** Button + live status for one ticker. Call wire() after inserting the html. */
export function deepDiveControl(ticker, { label = 'Run deep dive' } = {}) {
  const id = `dd-${ticker.replace(/[^A-Za-z0-9]/g, '_')}`;
  const html = `<div class="dd" id="${id}"><button class="btn" type="button">${esc(label)}</button><span class="dd-status" role="status"></span></div>`;

  const wire = () => {
    const root = document.getElementById(id);
    if (!root) return;
    const btn = root.querySelector('button'), status = root.querySelector('.dd-status');
    const render = () => {
      if (!document.body.contains(root)) return unsubscribe();
      const j = gh.job(ticker);
      btn.disabled = !!j?.active;
      if (!j) { status.innerHTML = ''; return; }
      const secs = Math.round((Date.now() - j.started) / 1000);
      const link = j.url ? ` <a href="${esc(j.url)}" target="_blank" rel="noopener">View run ↗</a>` : '';
      status.className = `dd-status ${j.state}`;
      status.innerHTML = j.state === 'error'
        ? `<span class="down">✕</span> ${esc(j.error)}${link}`
        : `${j.active ? '<span class="spinner" aria-hidden="true"></span>' : '✓'} ${STATUS[j.state]}${j.active ? ` <span class="muted">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</span>` : ''}${link}`;
    };
    const unsubscribe = gh.onJobChange(render);
    const tick = setInterval(() => document.body.contains(root) ? (gh.job(ticker)?.active && render()) : clearInterval(tick), 1000);
    render();

    btn.addEventListener('click', async () => {
      if (!gh.isConfigured() && !(await openSettings())) return;
      const published = async () => {
        try {
          const r = await fetch(`data/companies/${encodeURIComponent(ticker)}.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!r.ok) return false;
          const c = await r.json();
          return new Date(c.as_of) >= new Date(gh.job(ticker).started - 60_000);
        } catch { return false; }
      };
      await gh.runDeepDive(ticker, published);
      if (gh.job(ticker)?.state === 'done') {
        invalidate(`companies/${ticker}.json`);
        invalidate('companies/index.json');
        invalidate('holders.json');
        window.dispatchEvent(new Event('er:refresh'));
      }
    });
  };
  return { html, wire };
}
