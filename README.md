# Candle Outlook — Chart Analysis & Trade-Plan Terminal (v4 · offline tools)

Candle Outlook turns a candlestick chart screenshot into a structured, explainable technical read: market structure, a deterministic setup-quality scorecard, a scenario-based decision, and an explicit trade plan — never a single opaque "AI confidence" number.

Production entry point: `index.html`

Live market-data terminal: `terminal.html` (Twelve Data / Alpaca / yfinance via candle proxy, with Binance / Yahoo / CSV / demo fallbacks)

Legacy V6 screenshot analyzer (kept for reference): `screenshot.html`

## Offline analysis enhancements

The production analyzer and terminal work without external market-data APIs. The terminal **starts in offline mode**, with clearly labeled synthetic daily demo data; enabling online providers is an explicit choice. Existing provider integrations remain optional.

### Local CSV, replay and backtest

1. Open `index.html` and expand **Local OHLC · replay & backtest**.
2. Choose the CSV’s original interval, then import at least 30 candles with `time` (or `date`, `timestamp`, `datetime`), `open`, `high`, `low`, `close`, and optional `volume` columns. ISO timestamps with explicit timezone are preferred. Bare ISO dates/times are interpreted as UTC; Unix seconds/milliseconds are accepted. Quoted fields and UTF-8 BOMs are supported.
3. Reveal one candle at a time, move the slider, or reveal all. The chart, indicators, scorecard and analysis see only revealed candles.
4. Higher timeframes aggregate actual OHLCV into UTC buckets. Intraday/day buckets start at UTC boundaries; weeks start Monday 00:00 UTC. Only buckets whose start/end fit within revealed source data are used. Missing source bars are not invented; these are UTC buckets, **not exchange-session/calendar aggregation**. Lower timeframes are unavailable, and inconsistent source intervals are rejected.
5. Expand **Backtest revealed history** and configure fees/slippage in basis points per side. The engine tests its directional BUY/SELL decisions on revealed OHLC only, with signals at close, entry at next open, one position at a time and fixed stop/target 1. Stops crossed by opening gaps fill at the adverse open; target fills use the target price. If both levels are touched in one candle, the stop wins. A new signal may be formed at that candle’s close after an exit. Open positions are excluded from closed-trade statistics. Results show net R, expectancy, win rate and closed-trade drawdown in R; no compounding or capital/margin model is assumed. Backtests are capped at 5,000 candles. Small samples are labeled.

The terminal also validates CSV input and resamples imported data when changing timeframes. Its local multi-timeframe panel uses imported candles rather than provider requests. Unsupported lower intervals and insufficient completed history do not relabel the existing series.

### Screenshot adjustments and calibration

Use **Adjust chart reading** on each tile to crop out volume/indicator panels, choose custom bullish/bearish colors, preview detected candles, and click false detections to remove them. Body placement is derived from contiguous colored body rows rather than assuming it is centered within the wick. Reset adjustments restores excluded candles and the default crop/colors.

Choose **Pick two price references**, click the higher y-axis mark then the lower mark, and enter their actual prices in the calibration fields. Choose linear or logarithmic scale (log requires positive prices). Without selected marks, the entered values must correspond to the highest/lowest **detected candle wicks**, not arbitrary axis limits. Calibration references are preserved when analysis selects its most recent 60 candles. Imported OHLC uses its exact coordinate mapping automatically. Screenshot extraction and its confidence scores remain deterministic estimates, not calibrated probabilities or reconstructed exchange data.

Chart overlays show support/resistance, confirmation, stop and targets that lie inside the visible chart. Position sizing supports contract/value multiplier, quantity increments, conservative stop rounding to a price tick, and round-trip fees per unit. It does not model margin, FX conversion or portfolio exposure.

### Journal and offline installation

Existing v3 journal entries migrate to IndexedDB on the first successful load; the original localStorage copy is retained. IndexedDB stores are still local browser data and can be cleared/evicted, so export backups regularly. Imports are validated before saving and merge by ID. Saving confirms only after the storage transaction succeeds. A stale tab cannot overwrite another tab’s changes; reload it before retrying.

The site caches the analyzer/terminal and required assets after a successful online visit via a service worker, and includes an installable app manifest. It can then reload offline without contacting market-data providers. New cache versions activate after existing tabs close. The legacy Meridian/screenshot pages are not precached. No broker integration, external AI service or data subscription is required.

### Verification

- `npm test`: focused CSV, resampling, calibration, indicator, sizing, journal-input and backtest tests.
- `npm ci && npx playwright install`: install development-only browser tooling.
- `npm run test:browser`: starts its own local static server, then exercises Chromium, Firefox and WebKit at 1280px and 375px. `BROWSERS=firefox` selects one engine.
- `.github/workflows/test.yml`: engine/syntax checks on Linux and a macOS browser matrix, on pull requests and main pushes. Production remains static JavaScript; npm dependencies are only for verification.

## Workflow

`CHART → MARKET STRUCTURE → SETUP → SCENARIO → RISK → PLAN`

## What's new in v3

### Market structure engine

Swing-point detection classifies HH / HL / LH / LL sequences, trend breaks, consolidation, breakout-and-retest, liquidity sweeps and failed breakouts — structure carries more weight in the decision than any single candle.

### Deterministic setup-quality scorecard

Instead of one opaque confidence number, every setup is scored 0–10 on eight independent, inspectable factors — Structure, Support/Resistance, Candle, Volume, Momentum, R:R, Context and Timeframe alignment — combined with fixed weights into a 0–100 conviction score. **Pattern-ID confidence and trade conviction are reported separately**: a hammer can be identified with 90%+ confidence while still being a poor trade in a bad location.

### Scenario-based output

Results are framed as a primary scenario (bias, confirmation trigger, invalidation) and an explicit alternative scenario for when the setup fails — never a single guaranteed outcome.

### Multi-timeframe confirmation

Upload 5m / 15m / 1h / 4h screenshots of the same chart and pick a focus timeframe. Other timeframes are folded into the scorecard and no-trade check, weighted by rank — a bullish 5-minute candle against a strong 4-hour downtrend scores materially lower conviction.

### No-trade detection

The engine explicitly flags poor R:R, unclear/range-bound structure, price trapped mid-range, and conflicting higher timeframes, forcing a WAIT even when a single candle looks attractive. Sometimes WAIT is the most informative output.

### Event risk

An optional "elevated event risk" flag and free-text note (earnings, FOMC, CPI, etc.) is folded into the Context score and shown as a standalone warning — nothing is invented; this is user-supplied.

### Trade plan + position sizing

Every directional read gets an explicit Bias / Confirmation / Invalidation / Stop / Target 1 / Target 2 / R:R panel. Supplying the highest and lowest visible price on the chart's own y-axis calibrates every level to real $ values (linear interpolation — never fabricated). Adding account size and max-risk% then computes a position size.

### Journal, comparison & post-trade analysis

Save any analysis as a journal snapshot, record what actually happened (target hit / invalidated / sideways / false breakout), and Candle Outlook computes historical follow-through rates grouped by pattern + decision + volume context — strictly from your own recorded samples, never fabricated. Select saved setups for a side-by-side comparison table. Upload a later screenshot of a saved setup and the engine checks the new price against the original target/invalidation levels (when both charts are calibrated) and reports what changed. The journal uses IndexedDB with migration from the existing localStorage journal and a localStorage fallback. Save failures are shown explicitly. Export/import buttons on the Journal tab give it a portable JSON backup — import merges by entry id, so re-importing never clobbers newer local edits.

### Real momentum indicators

RSI(14) and EMA(9)/EMA(21) are computed from each candle's estimated close (not just a colored-candle-share proxy), and the engine checks for RSI divergence against the last two confirmed swing highs/lows — price making a higher high while RSI makes a lower high (or the mirror at lows) is flagged as momentum divergence and folded into the Momentum score.

## Multi-timeframe & candlestick pattern engine

- Bullish / bearish engulfing, doji / indecision, hammer / shooting-star rejection, morning-star / evening-star reversal, marubozu / impulse candles, three white soldiers / three black crows, piercing line / dark cloud cover, tweezer top / tweezer bottom, inside bar
- HH/HL/LH/LL swing structure, trend breaks, consolidation, breakout-retest, liquidity sweeps, failed breakouts
- Volume context (manual: expanding / average / contracting — never assumed), momentum acceleration/exhaustion via candle-range expansion/contraction, RSI(14)/EMA(9,21)/divergence
- Support/resistance from the most recent confirmed swing points

## Decision engine

Every focus-timeframe read resolves to one of:

- **BUY** — bullish evidence clears the conviction threshold and no no-trade condition is flagged
- **SELL** — bearish evidence clears the conviction threshold and no no-trade condition is flagged
- **WAIT** — evidence is mixed, a no-trade condition is flagged, or R:R is too weak to favor a trade

## Architecture

Static site is client-side (GitHub Pages). Optional Python candle proxy keeps API keys off the browser:

```
index.html            production UI (screenshot + live OHLC analysis)
css/app.css            styling
js/app.js               DOM wiring / rendering + live-candle handoff
js/journal.js           IndexedDB journal, stats, comparison, post-trade analysis
js/engine/geometry.js   pixel-space candle extraction from the uploaded screenshot
js/engine/ohlc.js       OHLC → geometry mapping for live terminal candles
js/engine/structure.js  market-structure engine (swings, HH/HL/LH/LL, events)
js/engine/patterns.js   candlestick pattern identification
js/engine/indicators.js RSI(14), EMA(9/21) and price/RSI divergence from candles' estimated closes
js/engine/scoring.js    deterministic weighted scoring engine
js/engine/scenario.js   levels, trade plan, price calibration, no-trade detection, scenario text
js/engine/mtf.js        multi-timeframe alignment
js/engine/analyze.js    composes the modules above into one full chart read
terminal.html/.js/.css  live market terminal
server/app.py           Flask candle proxy (Twelve Data + Alpaca + yfinance)
server/requirements.txt
server/.env.example     placeholder env var names only — never real keys
render.yaml             optional Render deploy for the proxy
```

Nothing is uploaded anywhere — every screenshot is read locally in the browser via `<canvas>` pixel scanning. No OHLC prices are fabricated: dollar levels only appear once you supply the visible chart high/low.



## Live candle proxy (Twelve Data + Alpaca + yfinance)

API keys must never ship in the static GitHub Pages site or frontend JS. Run the small Flask proxy locally (or on Render) and point the terminal at it.

### Required environment variables

| Variable | Purpose |
|---|---|
| `TWELVEDATA_API_KEY` | Twelve Data time-series |
| `ALPACA_API_KEY` | Alpaca key id (market data) |
| `ALPACA_API_SECRET` | Alpaca secret |
| `ALPACA_BASE_URL` | Optional, default `https://data.alpaca.markets` |
| `PORT` | Optional, default `5055` |
| `CORS_ORIGINS` | Optional, default `*` |

Copy `server/.env.example` → `server/.env` and fill in values. Do not commit `.env`.

### Run locally

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TWELVEDATA_API_KEY=...
export ALPACA_API_KEY=...
export ALPACA_API_SECRET=...
python app.py
# → http://localhost:5055
```

Endpoints:

- `GET /api/health`
- `GET /api/candles?symbol=AAPL&interval=5m&provider=auto|twelvedata|alpaca|yfinance&limit=500`

`provider=auto` tries Alpaca for US equities/ETFs, then Twelve Data, then keyless **yfinance** (Yahoo Finance). No API key required for yfinance.

### Terminal wiring

Open `terminal.html`. The proxy base defaults to `http://localhost:5055`. Override with:

- `?api=https://your-proxy.example`
- the **Candle API** input in the left rail (saved to `localStorage` key `co-api-base`)

When the proxy is reachable, Load market uses `/api/candles`. Otherwise the terminal keeps Binance (crypto), Yahoo chart, CSV import, and demo fallbacks.

**Send to analysis** stores the current OHLC series under `sessionStorage` / `localStorage` key `co-live-candles` and opens `index.html`, where Candle Outlook runs the structure/pattern/scorecard engine on real candles (no screenshot required).

### Deploy proxy on Render

`render.yaml` defines a Python web service rooted at `server/`. Set the three API env vars in the Render dashboard. Point the terminal API base at the Render URL.

## Deployment and QA

`.github/workflows/pages.yml` runs on every push to `main`:

1. Verifies the production file layout is present.
2. Syntax-checks every JS module with `node --check`.
3. Uploads and deploys the static site to GitHub Pages.

## Interpretation

Candle Outlook provides technical chart-research output, not personalized investment advice. BUY / SELL / WAIT labels describe the current chart evidence, not guaranteed future returns or instructions to transact. News, earnings, fundamentals, liquidity events, gaps and information outside the uploaded screenshot(s) can invalidate a technical setup.
