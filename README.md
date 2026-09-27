# Candle Outlook — Chart Analysis & Trade-Plan Terminal (v3)

Candle Outlook turns a candlestick chart screenshot into a structured, explainable technical read: market structure, a deterministic setup-quality scorecard, a scenario-based decision, and an explicit trade plan — never a single opaque "AI confidence" number.

Production entry point: `index.html`

Live market-data terminal (separate product, unchanged): `terminal.html`

Legacy V6 screenshot analyzer (kept for reference): `screenshot.html`

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
Save any analysis as a journal snapshot, record what actually happened (target hit / invalidated / sideways / false breakout), and Candle Outlook computes historical follow-through rates grouped by pattern + decision + volume context — strictly from your own recorded samples, never fabricated. Select saved setups for a side-by-side comparison table. Upload a later screenshot of a saved setup and the engine checks the new price against the original target/invalidation levels (when both charts are calibrated) and reports what changed.

## Multi-timeframe & candlestick pattern engine

- Bullish / bearish engulfing, doji / indecision, hammer / shooting-star rejection, morning-star / evening-star reversal, marubozu / impulse candles
- HH/HL/LH/LL swing structure, trend breaks, consolidation, breakout-retest, liquidity sweeps, failed breakouts
- Volume context (manual: expanding / average / contracting — never assumed), momentum acceleration/exhaustion via candle-range expansion/contraction
- Support/resistance from the most recent confirmed swing points

## Decision engine

Every focus-timeframe read resolves to one of:

- **BUY** — bullish evidence clears the conviction threshold and no no-trade condition is flagged
- **SELL** — bearish evidence clears the conviction threshold and no no-trade condition is flagged
- **WAIT** — evidence is mixed, a no-trade condition is flagged, or R:R is too weak to favor a trade

## Architecture

Pure client-side, no build step, no backend, no API keys:

```
index.html            production UI
css/app.css            styling
js/app.js               DOM wiring / rendering
js/journal.js           localStorage journal, stats, comparison, post-trade analysis
js/engine/geometry.js   pixel-space candle extraction from the uploaded screenshot
js/engine/structure.js  market-structure engine (swings, HH/HL/LH/LL, events)
js/engine/patterns.js   candlestick pattern identification
js/engine/scoring.js    deterministic weighted scoring engine
js/engine/scenario.js   levels, trade plan, price calibration, no-trade detection, scenario text
js/engine/mtf.js        multi-timeframe alignment
js/engine/analyze.js    composes the modules above into one full chart read
```

Nothing is uploaded anywhere — every screenshot is read locally in the browser via `<canvas>` pixel scanning. No OHLC prices are fabricated: dollar levels only appear once you supply the visible chart high/low.

## Deployment and QA

`.github/workflows/pages.yml` runs on every push to `main`:

1. Verifies the production file layout is present.
2. Syntax-checks every JS module with `node --check`.
3. Uploads and deploys the static site to GitHub Pages.

## Interpretation

Candle Outlook provides technical chart-research output, not personalized investment advice. BUY / SELL / WAIT labels describe the current chart evidence, not guaranteed future returns or instructions to transact. News, earnings, fundamentals, liquidity events, gaps and information outside the uploaded screenshot(s) can invalidate a technical setup.
