# OMIG Research

A personal research terminal built to the Ole Miss Investment Group's rules: **S&P 500 only**, and **a position in every GICS sector at all times**.

Every weekday it values all ~500 names, ranks the best ideas, names the strongest candidate in each of the 11 sectors, builds full DCF + comps models for the top ones, and pushes market news to your phone.

**How it works**

```
GitHub Actions
  ├─ Refresh research data (weekdays, 6:30pm ET, or the "Run deep dive" button)
  │    └─ python -m engine.build
  │         ├─ Universe: 503 S&P 500 names (Wikipedia GICS) → metrics (Yahoo Finance)
  │         ├─ Quick valuation for every name  → best ideas, best idea per sector
  │         ├─ Full models for the watchlist, top 2 ideas per sector, screen
  │         │  leaders and anything you request: statements, editable DCF,
  │         │  comps, consensus, management, ownership, news
  │         └─ writes JSON to docs/data/ and commits it
  └─ Market alerts (weekday mornings + every 30 min while the market is open)
       └─ python -m engine.alerts  → Telegram
GitHub Pages serves docs/ → the dashboard (HTML/CSS/JS, no build step)
```

Nothing runs on your laptop, so the site is reachable from anywhere and stays current on its own.

## Two layers of valuation

| | Quick valuation | Full model |
|---|---|---|
| Runs for | all 503 names, nightly | watchlist, top 2 ideas per sector, screen leaders, on request |
| Inputs | one quote request per name | 4–5 years of statements, estimates, peers |
| Methods | levered-FCF DCF + peer comps, averaged | 5-year unlevered DCF (perpetuity + exit multiple), sensitivity grids, full comps set, football field |
| Use it for | ranking and shortlisting | the pitch |

The quick valuation is deliberately conservative: free cash flow is capped at 1.25× net income so one good year can't be capitalised forever, the discount rate has a floor, and a name is only ranked when the two methods agree within 50%. Banks, insurers, REITs and cash-burning utilities are valued on comps alone and labelled as such.

## One-time setup

1. Create an empty repository on GitHub (e.g. `omig-finance`). Don't add a README.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/realmineyy/omig-finance.git
   git push -u origin main
   ```
3. **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/docs`.
4. **Settings → Actions → General → Workflow permissions**: *Read and write permissions*.
5. **Actions → Refresh research data → Run workflow** to kick off the first build.
6. **Phone alerts (Telegram).** Message [@BotFather](https://t.me/BotFather) in Telegram → `/newbot` → copy the token it gives you. Then run:
   ```bash
   python3 tools/telegram_setup.py
   ```
   It checks the token, waits for you to message your new bot, prints your chat id and sends a test alert. Add the two values it names as repository secrets (**Settings → Secrets and variables → Actions**): `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Confirm with **Actions → Market alerts → Run workflow → test**.
7. **Run deep dive button.** On each device, tap ⚙ in the site's top bar and follow the steps: a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to this repo with only **Actions: Read and write**. Stored in that browser only.

The site will be at `https://realmineyy.github.io/omig-finance/`.

> Public repos get GitHub Pages free. For a private repo you need GitHub Pro — free for students via the [GitHub Student Developer Pack](https://education.github.com/pack).

## Day to day

| I want to… | Do this |
|---|---|
| Find a pitch | **Best ideas** on the home page, ranked by upside to fair value. |
| Cover a sector | **Best idea by sector** — all 11 sectors, always shown, including ones with nothing cheap. |
| Build the real model | Open a name → **Run deep dive** (~2–3 min) → edit assumptions live. |
| Screen by hand | **Screener** tab. The URL saves the screen, so bookmark it. |
| Understand a number | Tap the ⓘ next to any label: plain English, the formula, and how to use it in a pitch. |
| Take it to the club | *Export model* (CSV) or *Print / PDF* on the company page. |
| Change what's tracked | Edit `config.yaml`: `watchlist`, `screens`, `deep_dives.per_sector`, `macro`. |

## Alerts

| When | What |
|---|---|
| Weekdays 6:00am CT | Morning brief: index/rates/commodities, S&P 500 names reporting today, your top 3 ideas, overnight headlines |
| Every 30 min, market hours | Only if something happened: S&P 500 names moving 5%+ (with the headline, when a story actually names that company) and macro headlines (Fed, CPI, jobs, tariffs, oil…) |

Nothing new means nothing is sent. Each item fires once per day.

## Running locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m engine.build                      # full run, ~2 min
.venv/bin/python -m engine.build --limit 80 --budget 5 # quick dev slice
.venv/bin/python -m engine.build --skip-universe --tickers NVDA,CRM
.venv/bin/python -m engine.alerts brief --dry-run     # print, don't send
python3 tools/serve.py                                # http://localhost:8000
.venv/bin/python -m pytest -q                         # valuation math + JS/Python parity
```

## Layout

| Path | What |
|---|---|
| `config.yaml` | Watchlist, saved screens, deep-dive policy, macro assumptions |
| `engine/universe.py` | S&P 500 constituents + the 11 GICS sectors |
| `engine/fetch.py` | All Yahoo access: retries, shared rate-limit brake, FX normalization |
| `engine/quickval.py` | The valuation every name gets, and the idea filters |
| `engine/valuation.py` | Full DCF, sensitivity, comps |
| `engine/financials.py` | Statement normalization and historical ratios |
| `engine/metrics.py` | Screener fields (one definition the UI reads) |
| `engine/alerts.py` | Morning brief and breaking alerts |
| `engine/news.py` | News parsing + auto-linking companies named in a headline |
| `docs/js/dcf.js` | The same DCF in JavaScript for live editing (kept identical by `tests/`) |
| `docs/js/glossary.js` | Every ⓘ explanation |
| `tools/telegram_setup.py` | One-time bot setup: finds your chat id, sends a test alert |
| `.github/workflows/` | `refresh.yml` (data), `alerts.yml` (Telegram) |

## Data sources and caveats

All free, no API keys: **Yahoo Finance** (via `yfinance`) for quotes, fundamentals, estimates, holders, officers and news; **Wikipedia** for S&P 500 membership and GICS sectors; **SEC EDGAR** for filing links.

Yahoo's data is unofficial and occasionally wrong. Before pitching, check the key figures against the 10-K (every company page links to its SEC filings). A name Yahoo won't serve keeps its last good data and is tagged *stale* with its date.

The quick valuation ranks candidates; it is not a price target. The full model is a starting point whose assumptions you are expected to change. Neither is investment advice.
