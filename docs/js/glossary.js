// Plain-English explanations behind every ⓘ button.
//   plain:   what it means, no jargon
//   formula: how it's calculated here
//   pitch:   how to use it when you're presenting
// Keys match screener field keys and DCF assumption keys where they overlap.

export const GLOSSARY = {
  // ─── Market ────────────────────────────────────────────────────────────────
  price: {
    title: 'Price',
    plain: 'What one share costs on the stock market right now (delayed ~15 minutes).',
  },
  mcap: {
    title: 'Market cap',
    plain: 'What the whole company is worth on the stock market: the price tag to buy every share.',
    formula: 'Share price × shares outstanding',
    pitch: 'Sets the size bucket: large cap (>$10B), mid cap ($2–10B), small cap (<$2B). Smaller caps are less covered by Wall Street, which is where mispricings hide.',
  },
  ev: {
    title: 'Enterprise value (EV)',
    plain: 'The price to buy the entire business, including paying off its debt, minus the cash you get with it. Think of buying a house: the price plus the mortgage you take over, minus cash left in the safe.',
    formula: 'Market cap + total debt − cash',
    pitch: 'Use EV (not market cap) when comparing companies with different amounts of debt.',
  },

  // ─── Valuation multiples ───────────────────────────────────────────────────
  pe: {
    title: 'P/E ratio (trailing)',
    plain: 'How many dollars investors pay for each $1 of profit the company earned over the past year. A P/E of 20 means you pay $20 for $1 of annual earnings.',
    formula: 'Share price ÷ earnings per share (last 12 months)',
    pitch: 'Higher P/E = market expects more growth (or is too optimistic). Always compare against peers and the company\'s own history, never in isolation.',
  },
  fpe: {
    title: 'P/E ratio (forward)',
    plain: 'Same as P/E, but using what analysts expect the company to earn next year instead of last year.',
    formula: 'Share price ÷ consensus next-year EPS',
    pitch: 'If forward P/E is much lower than trailing P/E, analysts expect earnings to jump. Ask yourself whether that\'s realistic.',
  },
  peg: {
    title: 'PEG ratio',
    plain: 'P/E adjusted for growth. It asks: "Am I paying a fair price for how fast profits are growing?"',
    formula: 'P/E ÷ expected annual EPS growth (in %)',
    pitch: 'Rule of thumb: below 1 can be cheap for its growth, above 2 is pricey. Popularized by Peter Lynch.',
  },
  ps: {
    title: 'Price / Sales',
    plain: 'How much investors pay for each $1 of revenue. Useful when a company has little or no profit yet.',
    formula: 'Market cap ÷ revenue (last 12 months)',
  },
  pb: {
    title: 'Price / Book',
    plain: 'Market value compared to the company\'s net worth on paper (assets minus liabilities). Below 1 means the market values it for less than its accounting net worth.',
    formula: 'Market cap ÷ shareholders\' equity',
    pitch: 'The go-to multiple for banks and insurers, whose assets are mostly financial and marked close to real value.',
  },
  ev_rev: {
    title: 'EV / Revenue',
    plain: 'What the whole business (including debt) costs per $1 of sales.',
    formula: 'Enterprise value ÷ revenue (last 12 months)',
  },
  ev_ebitda: {
    title: 'EV / EBITDA',
    plain: 'The most common "how expensive is this business?" number on Wall Street. It compares the whole business\'s price to its cash-like operating profit.',
    formula: 'Enterprise value ÷ EBITDA (last 12 months)',
    pitch: 'The standard multiple for comps and for the exit value in a DCF. Works across companies with different debt levels and tax situations.',
  },
  fcf_yield: {
    title: 'Free cash flow yield',
    plain: 'If you bought the whole company, the cash it throws off each year as a % of your purchase price. Like the interest rate on a savings account, but for a business.',
    formula: 'Free cash flow (last 12 months) ÷ market cap',
    pitch: 'Compare it to the 10-year Treasury yield. A 7% FCF yield vs. a 4% Treasury is a strong "this is cheap" talking point.',
  },
  div_yield: {
    title: 'Dividend yield',
    plain: 'The cash dividend paid each year as a % of the share price.',
    formula: 'Annual dividend per share ÷ price',
  },

  // ─── Profitability ─────────────────────────────────────────────────────────
  gross_m: {
    title: 'Gross margin',
    plain: 'Out of every $1 of sales, how much is left after paying the direct cost of making the product.',
    formula: 'Gross profit ÷ revenue',
    pitch: 'High and stable gross margins (software ~70%+, retail ~25%) signal pricing power, a sign of a moat.',
  },
  op_m: {
    title: 'Operating margin',
    plain: 'Out of every $1 of sales, how much profit is left after all normal business costs (product, salaries, rent, marketing, R&D), before interest and taxes.',
    formula: 'Operating income (EBIT) ÷ revenue',
    pitch: 'The cleanest read on how good the core business is. Expanding margins are a classic bull-case driver.',
  },
  net_m: {
    title: 'Net margin',
    plain: 'Out of every $1 of sales, how much ends up as profit for shareholders after everything, including interest and taxes.',
    formula: 'Net income ÷ revenue',
  },
  roe: {
    title: 'Return on equity (ROE)',
    plain: 'How much profit the company makes for each $1 shareholders have invested in it.',
    formula: 'Net income ÷ shareholders\' equity',
    pitch: '15%+ sustained is strong. Watch out: heavy debt or big buybacks can inflate ROE artificially.',
  },
  roa: {
    title: 'Return on assets (ROA)',
    plain: 'How much profit the company squeezes out of everything it owns.',
    formula: 'Net income ÷ total assets',
  },
  roic: {
    title: 'Return on invested capital (ROIC)',
    plain: 'The single best measure of business quality: how much after-tax operating profit the company earns on all the money invested in it (by lenders and shareholders).',
    formula: 'EBIT × (1 − tax rate) ÷ (debt + equity − cash)',
    pitch: 'If ROIC is above WACC, growth creates value; if it\'s below, growth destroys it. Great pitches show ROIC well above WACC for years.',
  },

  // ─── Growth ────────────────────────────────────────────────────────────────
  rev_g: {
    title: 'Revenue growth',
    plain: 'How much sales grew in the latest quarter compared to the same quarter a year ago.',
    formula: '(Revenue this quarter ÷ same quarter last year) − 1',
  },
  eps_g: {
    title: 'EPS growth',
    plain: 'How much profit per share grew in the latest quarter compared to a year ago.',
    formula: '(EPS this quarter ÷ same quarter last year) − 1',
  },

  // ─── Balance sheet ─────────────────────────────────────────────────────────
  net_debt_ebitda: {
    title: 'Net debt / EBITDA',
    plain: 'How many years of operating profit it would take to pay off all the company\'s debt (after using its cash). Negative means it has more cash than debt.',
    formula: '(Total debt − cash) ÷ EBITDA',
    pitch: 'Under 2x is comfortable, over 4x is heavy. Lenders watch this number closely, so high leverage is a key risk to address.',
  },
  de: {
    title: 'Debt / Equity',
    plain: 'How much the company has borrowed compared to what shareholders have put in.',
    formula: 'Total debt ÷ shareholders\' equity',
  },
  current_ratio: {
    title: 'Current ratio',
    plain: 'Can the company pay its bills due within a year? Compares short-term assets (cash, inventory, receivables) to short-term obligations.',
    formula: 'Current assets ÷ current liabilities',
    pitch: 'Below 1 isn\'t automatically bad (Costco and Apple run below 1 on purpose), but it matters for weaker businesses.',
  },

  // ─── Risk & momentum ───────────────────────────────────────────────────────
  beta: {
    title: 'Beta',
    plain: 'How much the stock tends to swing compared to the overall market. Beta 1.5 means it has typically moved 1.5% for every 1% the S&P 500 moves.',
    formula: '5-year monthly regression vs. S&P 500 (from Yahoo). Clamped to 0.5–2.5 in the DCF.',
    pitch: 'Higher beta → higher cost of equity → lower DCF value. It\'s the "risk" input in the model.',
  },
  chg_52w: { title: '52-week return', plain: 'How much the share price has changed over the last 12 months.' },
  off_high: {
    title: 'Off 52-week high',
    plain: 'How far the stock has fallen from its highest price in the past year. −30% means it\'s 30% below the peak.',
    pitch: 'Big drops in quality companies are where contrarian pitches start. Your job is to explain why the market is wrong.',
  },
  short_float: {
    title: 'Short interest (% of float)',
    plain: 'The share of tradeable stock that investors have borrowed and sold, betting the price will fall.',
    pitch: 'Above ~10% means a lot of smart money is bearish. Know their argument before you pitch the long side.',
  },
  low52: { title: '52-week range', plain: 'The lowest and highest prices the stock has traded at over the last year.' },

  // ─── Street ────────────────────────────────────────────────────────────────
  target_upside: {
    title: 'Street upside',
    plain: 'How far the average Wall Street analyst price target is above (or below) today\'s price.',
    formula: 'Mean analyst target ÷ price − 1',
  },
  rec: {
    title: 'Analyst rating',
    plain: 'Average analyst recommendation on a 1–5 scale: 1 = strong buy, 3 = hold, 5 = strong sell.',
  },
  analysts: { title: 'Analyst coverage', plain: 'How many Wall Street analysts publish estimates on this company. Fewer analysts means less attention and more room for mispricing.' },
  street: {
    title: 'Street targets',
    plain: 'The range of 12-month price targets published by Wall Street analysts (lowest, average, highest).',
    pitch: 'Useful as a sanity check, not a thesis. If your target sits far outside the Street range, have a crisp reason why.',
  },

  // ─── DCF concepts ──────────────────────────────────────────────────────────
  dcf: {
    title: 'Discounted cash flow (DCF)',
    plain: 'Values a company as the sum of all the cash it will generate in the future, translated into today\'s dollars. A dollar next year is worth less than a dollar today, so future cash is "discounted".',
    formula: 'Project 5 years of free cash flow → add a terminal value for everything after → discount it all back at the WACC → subtract debt, add cash → divide by shares',
    pitch: 'This is your intrinsic value. The story you tell about growth and margins IS the DCF, so every assumption should tie back to your thesis.',
  },
  rev_growth_y1: {
    title: 'Revenue growth: year 1',
    plain: 'How fast you expect sales to grow next year. Defaults to the Wall Street consensus when available, otherwise the 3-year historical growth rate.',
    pitch: 'Growth then glides in a straight line to your year-5 rate. Your thesis should explain why growth will be faster or slower than consensus.',
  },
  rev_growth_y5: {
    title: 'Revenue growth: year 5',
    plain: 'How fast sales are growing by the end of the forecast. It should be heading toward a normal, mature rate, since nothing grows fast forever.',
  },
  ebit_margin_y1: {
    title: 'Operating margin: year 1',
    plain: 'Operating profit as a % of sales next year. Defaults to the latest reported year.',
  },
  ebit_margin_y5: {
    title: 'Operating margin: year 5',
    plain: 'Operating profit as a % of sales by year 5. Defaults to the 3-year average. Margins glide in a straight line from year 1 to here.',
    pitch: 'Margin expansion is one of the most powerful (and most abused) DCF levers. Back it up with something concrete: pricing, mix shift, cost cuts.',
  },
  tax_rate: {
    title: 'Tax rate',
    plain: 'The share of operating profit paid in taxes. Defaults to the company\'s actual recent effective rate, kept between 10% and 30%.',
  },
  da_pct: {
    title: 'D&A (% of revenue)',
    plain: 'Depreciation & amortization: the accounting charge for wearing out equipment and buildings. It\'s not a cash cost, so it gets added back to cash flow.',
  },
  capex_pct: {
    title: 'CapEx (% of revenue)',
    plain: 'Capital expenditures: cash spent on long-lived things like factories, stores, trucks, and servers.',
    pitch: 'If CapEx is well above D&A, the company is investing to grow. If it\'s below, it may be under-investing.',
  },
  nwc_pct: {
    title: 'Net working capital (% of revenue)',
    plain: 'Cash tied up in running the business day to day: inventory plus money customers owe, minus money owed to suppliers. As sales grow, this ties up more cash.',
    formula: 'Each year: change in revenue × this %. Negative (like Costco) means suppliers effectively fund growth.',
  },
  fcff: {
    title: 'Unlevered free cash flow',
    plain: 'The cash the business generates that could go to ALL investors (lenders and shareholders) after paying taxes and reinvesting in the business.',
    formula: 'EBIT × (1 − tax) + D&A − CapEx − increase in working capital',
  },
  nopat: {
    title: 'NOPAT',
    plain: 'Net operating profit after tax: what operating profit would be if the company had no debt.',
    formula: 'EBIT × (1 − tax rate)',
  },
  wacc: {
    title: 'WACC (discount rate)',
    plain: 'The minimum annual return investors demand for putting money into this business: a blend of what shareholders expect and what lenders charge. Higher risk → higher WACC → lower value today.',
    formula: '(Equity weight × cost of equity) + (debt weight × after-tax cost of debt)',
    pitch: 'Most US large caps land around 8–10%. Small changes swing value a lot, which is why the sensitivity table matters.',
  },
  risk_free: {
    title: 'Risk-free rate',
    plain: 'What you could earn with zero risk: the 10-year US Treasury yield. Pulled live each night.',
  },
  erp: {
    title: 'Equity risk premium',
    plain: 'The extra annual return investors demand for owning stocks instead of risk-free Treasuries. Commonly 4.5–6%.',
  },
  cost_equity: {
    title: 'Cost of equity',
    plain: 'The annual return shareholders expect for owning this particular stock, given its risk.',
    formula: 'CAPM: risk-free rate + beta × equity risk premium',
  },
  cost_of_debt: {
    title: 'Cost of debt (pre-tax)',
    plain: 'The interest rate the company pays on its borrowing. Interest is tax-deductible, so the model uses the after-tax cost.',
    formula: 'Interest expense ÷ total debt (kept between the risk-free rate and +6%)',
  },
  terminal_growth: {
    title: 'Terminal growth rate',
    plain: 'How fast cash flows grow every year forever after year 5. Should be at or below long-run economic growth (2–3%), since no company outgrows the economy forever.',
    pitch: 'Anything above ~3.5% is hard to defend in front of a committee.',
  },
  exit_multiple: {
    title: 'Exit multiple (EV/EBITDA)',
    plain: 'Instead of assuming growth forever, assume you sell the whole business at the end of year 5 for this multiple of its EBITDA. Defaults to the peer median.',
    pitch: 'Cross-check: the perpetuity method\'s implied multiple and this method\'s implied growth should look reasonable next to each other.',
  },
  mid_year: {
    title: 'Mid-year convention',
    plain: 'Cash comes in throughout the year, not all on Dec 31st. This discounts each year\'s cash as if it arrived mid-year, which is the standard banker convention and a slightly higher value.',
  },
  terminal_value: {
    title: 'Terminal value',
    plain: 'The value of all cash flows after the 5-year forecast, rolled into one number. Usually the majority of a DCF\'s value.',
    formula: 'Perpetuity: FCF₅ × (1 + g) ÷ (WACC − g).   Exit: EBITDA₅ × exit multiple',
  },
  tv_share: {
    title: 'Terminal value % of EV',
    plain: 'How much of the total value comes from years 6+ (the terminal value) rather than the explicit forecast.',
    pitch: 'Above ~75% means the valuation mostly rides on long-term assumptions. Say so upfront, since committees will ask.',
  },
  perpetuity: {
    title: 'Perpetuity growth method',
    plain: 'Terminal value assumes cash flows keep growing at the terminal growth rate forever.',
  },
  exit: {
    title: 'Exit multiple method',
    plain: 'Terminal value assumes the business is sold at the end of year 5 at a peer-style EV/EBITDA multiple.',
  },
  implied_multiple: {
    title: 'Implied exit multiple',
    plain: 'The EV/EBITDA multiple the perpetuity-growth terminal value works out to. If it\'s far from peers, your growth or WACC may be off.',
  },
  implied_growth: {
    title: 'Implied perpetual growth',
    plain: 'The forever growth rate the exit-multiple terminal value works out to. If it\'s above ~3.5%, the exit multiple is probably too generous.',
  },
  bridge: {
    title: 'EV → equity bridge',
    plain: 'The DCF values the whole business (enterprise value). To get to what shareholders own: subtract debt and minority interests, add cash, then divide by shares.',
  },
  net_debt: {
    title: 'Net debt',
    plain: 'Debt minus cash. Negative means the company has more cash than debt (a "net cash" balance sheet).',
  },
  minority_interest: {
    title: 'Minority interest',
    plain: 'The slice of subsidiaries the company consolidates but doesn\'t fully own. It belongs to someone else, so it\'s subtracted.',
  },
  implied_price: {
    title: 'Implied share price',
    plain: 'What one share is worth according to this valuation method.',
  },
  upside: {
    title: 'Upside / downside',
    plain: 'How far the implied value is above (+) or below (−) today\'s price.',
    pitch: 'Most investment clubs look for 15–20%+ upside to justify a buy, enough margin of safety for being wrong.',
  },
  sensitivity: {
    title: 'Sensitivity table',
    plain: 'Shows how the share price changes if the two most uncertain inputs are a bit higher or lower. The center cell is your base case.',
    pitch: 'Put this on a slide. It shows the committee you know the value is a range, not a single number.',
  },

  // ─── Comps & summary ───────────────────────────────────────────────────────
  comps: {
    title: 'Trading comparables ("comps")',
    plain: 'Values the company by looking at what the market pays for similar companies. If peers trade at 12× EBITDA, what would this company be worth at 12×?',
    formula: 'Peers = same industry (or sector if too few), closest in market cap. Implied price uses the peer 25th percentile, median, and 75th percentile.',
    pitch: 'Pick peers a committee would agree with. Remove any that don\'t really compete, and say why.',
  },
  peer_range: {
    title: 'Peer range (25th–75th percentile)',
    plain: 'The middle half of peer valuations. Using a range instead of one number avoids being skewed by one outlier.',
  },
  football_field: {
    title: 'Football field',
    plain: 'The classic banker chart: each bar shows the range of values from one method, side by side, with the current price as a vertical line. Where the bars cluster is your valuation.',
    pitch: 'Usually the single most important slide in a pitch deck.',
  },
  blended: {
    title: 'Blended value',
    plain: 'A simple average of the DCF (perpetuity), DCF (exit multiple), and comps median. A quick triangulated target, not a substitute for judgment.',
  },
  ebitda: {
    title: 'EBITDA',
    plain: 'Earnings before interest, taxes, depreciation & amortization: a rough proxy for the cash profit the core business generates.',
    formula: 'Operating income + depreciation & amortization',
  },
  ebit: {
    title: 'EBIT (operating income)',
    plain: 'Profit from the core business before interest and taxes.',
  },
  eps: {
    title: 'EPS (diluted)',
    plain: 'Net profit divided by the number of shares (including options that could become shares).',
  },
  fcf: {
    title: 'Free cash flow',
    plain: 'Cash from operations minus capital spending: the cash truly left over that could be paid out, used for buybacks, or used to pay down debt.',
    formula: 'Operating cash flow − CapEx',
  },
  fcf_margin: { title: 'FCF margin', plain: 'Free cash flow as a % of revenue: how much of each sales dollar turns into spare cash.' },
  sbc: {
    title: 'Stock-based compensation',
    plain: 'Pay given to employees in stock instead of cash. It\'s a real cost to shareholders (dilution) even though it isn\'t a cash expense.',
  },
  buybacks: { title: 'Share buybacks', plain: 'Cash spent repurchasing the company\'s own stock, which shrinks the share count so each remaining share owns more.' },
  // ─── People, ownership & outlook ───────────────────────────────────────────
  officers: {
    title: 'Executive team',
    plain: 'The top officers the company reports, with their most recent total compensation (salary + bonus + stock awards, per the proxy statement).',
    pitch: 'Check whether pay is tied to the metrics you care about (ROIC, FCF per share) or just size. Misaligned incentives are a legitimate risk slide.',
  },
  insiders_pct: {
    title: 'Insider ownership',
    plain: 'The share of the company owned by its own executives and directors.',
    pitch: 'High insider ownership ("skin in the game") means management wins when shareholders win. Founder-led companies often score high.',
  },
  institutions_pct: {
    title: 'Institutional ownership',
    plain: 'The share of the company owned by funds: mutual funds, pensions, hedge funds, index funds.',
    pitch: 'Very high (>90%) means it\'s crowded, so there are fewer natural new buyers. Low institutional ownership can mean undiscovered.',
  },
  top_holders: {
    title: 'Top institutional holders',
    plain: 'The biggest funds that own the stock, from their quarterly 13F filings with the SEC. "Change" is how much they added or trimmed last quarter.',
    pitch: 'Click a holder to see what else they own across your research. Smart-money buying into weakness is a useful supporting data point.',
  },
  consensus: {
    title: 'Consensus estimate',
    plain: 'The average forecast of all Wall Street analysts covering the company. The low–high range shows how much they disagree.',
    pitch: 'The market price already reflects consensus. Your edge (the "variant view") is where and why you differ from it.',
  },
  pe_projection: {
    title: 'Price at a constant multiple',
    plain: 'A simple short-term projection: if the market keeps paying the same P/E, the price moves with earnings. Price = projected EPS × P/E.',
    formula: 'Consensus EPS for the year × (today\'s trailing P/E, or the peer median forward P/E)',
    pitch: 'Pairs well with the DCF: the DCF is the long-term intrinsic value, this is where the stock could trade in 1–2 years if sentiment holds.',
  },
  growth_source: {
    title: 'Where the growth default comes from',
    plain: '"Consensus" = average Wall Street analyst revenue estimate for the current fiscal year. "History" = the company\'s 3-year revenue growth rate (used when there\'s no consensus).',
  },
};
