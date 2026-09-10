# Candle Outlook — All-in-One Market Analysis Terminal

Candle Outlook is a TradingView-inspired technical-analysis workspace focused on one job: turn market price action into a structured, explainable chart decision and risk plan.

Production entry point: `index.html`

Legacy screenshot analyzer: `screenshot.html`

## Workflow

`SCAN → CHART → ANALYZE → CONFIRM → RISK → PLAN`

## Included in the production terminal

### Interactive chart
- Candlestick chart rendered locally in the browser
- Mouse-wheel zoom
- Drag-to-pan
- Crosshair OHLCV inspection
- 5m / 15m / 1h / 4h / 1D / 1W timeframes
- Automatic support and resistance overlays
- Volume overlay

### Indicators
- EMA 20
- EMA 50
- EMA 200
- RSI 14
- MACD
- ATR 14
- Bollinger Bands
- Volume vs 20-period average

### Pattern and structure engine
- Bullish / bearish engulfing
- Doji / indecision
- Hammer-like rejection
- Shooting-star rejection
- Morning-star reversal
- Evening-star reversal
- Marubozu / impulse candles
- EMA structure and slope
- Momentum alignment
- Swing-based support / resistance context
- High-volume directional confirmation

### Decision engine
Every chart is framed as one of:

- **BUY** — bullish evidence has sufficient multi-factor alignment
- **SELL** — bearish evidence has sufficient multi-factor alignment
- **WAIT** — evidence is mixed or not strong enough

The output separates:

- Overall conviction
- Pattern confidence
- Bullish evidence score
- Bearish evidence score
- Trend
- Momentum
- Key support and resistance

A directional setup also receives:

- Entry reference
- ATR/support/resistance-based invalidation
- Target 1 at approximately 2R
- Target 2 at approximately 3R
- Explicit condition that invalidates the setup

## Multi-timeframe confirmation

For market-loaded symbols the terminal checks:

- 5m
- 15m
- 1h
- 4h
- 1D
- 1W

Each timeframe receives its own BUY / SELL / WAIT read so the user can see whether the setup is aligned or fighting the higher timeframe.

## Watchlist and scanner

The default watchlist contains QQQ, SPY, SMH, GLD, BTC-USD and ETH-USD. The user can add symbols locally in the browser.

`Scan watchlist` analyzes the current timeframe and ranks symbols by signal and conviction. Watchlist preferences are retained in localStorage.

## Market data

Candle Outlook uses a provider abstraction rather than hard-wiring the analysis logic to one vendor.

Current browser-side adapters:

- Binance public candles for supported crypto pairs
- Public Yahoo chart endpoints for supported stocks / ETFs when browser access is permitted
- OHLC CSV import as a deterministic fallback
- Built-in deterministic demo data when a browser/provider blocks public data access

No API key is embedded in the public repository.

Expected CSV columns:

`time,open,high,low,close,volume`

`date` can be used instead of `time`. At minimum, `open,high,low,close` and 30 valid candles are required.

## Screenshot mode

The previous V6 pixel-based screenshot analyzer remains intact at `screenshot.html`. It can read conventional green/red candlestick screenshots locally in the browser and derives approximate candle geometry without fabricating exact OHLC prices from pixels.

## Deployment and QA

The repository includes `.github/workflows/pages.yml`.

On every push to `main` it:

1. Verifies required production files exist.
2. Checks that the chart, scanner, screenshot route and analysis functions are present.
3. Runs `node --check terminal.js` to catch JavaScript syntax failures.
4. Uploads the static site as a GitHub Pages artifact.
5. Deploys the artifact to GitHub Pages.

The repository also retains GitHub's existing Pages deployment path, so the production branch remains directly publishable.

## Interpretation

Candle Outlook provides technical chart-research output, not personalized investment advice. BUY / SELL / WAIT labels describe the current chart evidence, not guaranteed future returns or instructions to transact. News, earnings, fundamentals, liquidity events, gaps and stale or incomplete data can invalidate a technical setup.