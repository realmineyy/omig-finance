# Equity Research

A personal research terminal: screen every NYSE and Nasdaq stock, deep-dive the interesting ones, and build a pitch-ready valuation (DCF, trading comps, football field) that updates itself every weekday.

**How it works**

```
GitHub Actions (every weekday, 6:30pm ET, or the "Run deep dive" button)
  └─ python -m engine.build
       ├─ Universe: ~6,000 NYSE + Nasdaq stocks (SEC ticker list) → screener metrics (Yahoo Finance)
       ├─ Deep dives: watchlist + top names from each saved screen + anything you request
       │    statements, DCF, comps, consensus, management, ownership, news
       └─ writes JSON to docs/data/ and commits it
GitHub Pages serves docs/ → the dashboard (HTML/CSS/JS, no build step)
```

Nothing runs on your laptop, so the site is reachable from anywhere and stays current on its own.

## One-time setup

1. Create an empty repository on GitHub (e.g. `equity-research`). Don't add a README.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<you>/equity-research.git
   git push -u origin main
   ```
3. **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/docs`. Save.
4. **Settings → Actions → General → Workflow permissions**: select *Read and write permissions*. Save.
5. **Actions → Refresh research data → Run workflow** once to kick off the first refresh.
6. To use the **Run deep dive** button, connect each browser you use once (phone, laptop). Tap ⚙ in the site's top bar and follow the steps: create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to this one repo with only **Actions: Read and write**, then paste it in. It's stored in that browser only and sent only to GitHub. If a device is ever lost, delete the token on GitHub.

The site will be at `https://<you>.github.io/equity-research/`.

> Public repos get GitHub Pages free. For a private repo you need GitHub Pro, which is free for students through the [GitHub Student Developer Pack](https://education.github.com/pack).

## Day to day

| I want to… | Do this |
|---|---|
| Find ideas | **Screener** tab: start from a saved screen or add filters. The URL saves the screen, so bookmark it. |
| Deep-dive a new ticker now | Open its page and hit **Run deep dive**. The page shows progress and reloads with the full model in ~2–3 minutes. (Without the button: GitHub → Actions → Refresh research data → Run workflow, enter tickers, tick *skip universe*.) |
| Keep a company updated | Deep dives refresh automatically once they're a week old. Add it to `watchlist` in `config.yaml` for nightly updates. |
| Change a saved screen | Edit `screens` in `config.yaml`. |
| Stress-test a valuation | Change any assumption on the company page. The DCF, sensitivity tables, and football field update live. Your changes are saved in that browser; *Reset to defaults* clears them. |
| Understand a number | Tap the ⓘ next to any label for a plain-English explanation and how to use it in a pitch. |
| Take it into a deck | *Export model* (CSV) or *Print / PDF* on the company page. |

## Running locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m engine.build --limit 300     # quick: 300 largest companies
.venv/bin/python -m engine.build                 # full market (~15–30 min)
.venv/bin/python -m engine.build --skip-universe --tickers NVDA,CRM
python3 tools/serve.py                           # open http://localhost:8000 (no caching)
.venv/bin/python -m pytest -q                    # valuation math + JS/Python parity
```

## Layout

| Path | What |
|---|---|
| `config.yaml` | Watchlist, saved screens, macro assumptions |
| `engine/universe.py` | Listings (SEC) + S&P membership (Wikipedia) |
| `engine/fetch.py` | All Yahoo Finance access; retries and throttling |
| `engine/metrics.py` | Screener fields (the single definition the UI reads) |
| `engine/financials.py` | Statement normalization, historical ratios |
| `engine/valuation.py` | Default assumptions, DCF, sensitivity, comps |
| `engine/profile.py`, `engine/news.py` | Management, ownership, consensus, news + company linking |
| `docs/js/dcf.js` | The same DCF in JavaScript for live editing (kept identical by `tests/`) |
| `docs/js/glossary.js` | Every ⓘ explanation |
| `docs/js/github.js`, `docs/js/deepdive.js` | The Run deep dive button: triggers the workflow and follows it |
| `.github/workflows/refresh.yml` | The scheduled and on-demand refresh |

## Data sources and caveats

All free, no API keys: **Yahoo Finance** (via `yfinance`) for quotes, fundamentals, estimates, holders, officers, and news; **SEC** for the listed-company universe and filing links; **Wikipedia** for S&P index membership.

Yahoo data is unofficial and occasionally wrong or missing, especially for small caps. Before pitching, check key figures against the 10-K (use the *SEC filings* link on every company page).

**Refresh cadence.** Yahoo rate-limits bulk requests, so each run refreshes the universe for at most `time_budget_minutes` (config). The S&P 1500, your watchlist, and deep-dived names go first, then whichever rows are oldest, so the whole market cycles through every few runs. Nothing is dropped; rows not refreshed in 3+ days show a *stale* tag with their date. When Yahoo throttles, every request pauses together and backs off.

**Foreign companies (ADRs).** Many report in their home currency while trading in USD. The engine converts everything to the trading currency at the latest FX rate and flags it on the company page. Emerging-market names also need a country risk premium added to the equity risk premium, which the default WACC doesn't include.

This is a research and education tool, not investment advice.
