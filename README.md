# Candle Outlook — V7

Candle Outlook is evolving from a screenshot-first candlestick reader into an interactive technical-analysis workspace.

## V7 interactive terminal

Open `terminal.html` for the new TradingView-inspired workspace.

Current terminal capabilities:

- Interactive candlestick chart rendered locally in the browser
- Mouse-wheel zoom and drag-to-pan
- Crosshair-style OHLC inspection
- EMA 20 / EMA 50 / EMA 200 overlays
- RSI 14 and ATR calculations
- Automatic recent support and resistance levels
- Candle-pattern detection including engulfing, doji, hammer-like, shooting-star and impulse candles
- Combined technical evidence scoring
- Clear **BUY / SELL / WAIT** chart decision
- Separate overall conviction and pattern confidence
- Entry reference, invalidation and 2R target framing when a directional setup is present
- Evidence list explaining why the engine reached its conclusion
- OHLC CSV import for real market data without sending the file to a backend
- Built-in demo data for immediate testing

The terminal workflow is:

`CHART → ANALYZE → CONFIRM → RISK → PLAN`

## Screenshot analyzer

The original V6 screenshot analyzer remains available in `index.html` while V7 is validated.

Its workflow is:

`UPLOAD → READ CANDLES → SCORE BULL/BEAR EVIDENCE → CHART SIGNAL → CONFIRMATION → INVALIDATION`

Screenshot processing remains local to the browser. It deliberately avoids fabricating exact OHLC prices from pixels.

## Decision framework

The terminal does not issue a signal from one indicator. It combines independent evidence such as:

1. Price relative to EMA 20
2. EMA 20 / EMA 50 trend structure
3. EMA slope
4. RSI momentum context
5. Candle-pattern context
6. Visible support / resistance location
7. ATR-based risk framing

Pattern confidence describes confidence in the detected candle formation. Overall conviction describes how strongly the independent factors agree. They are intentionally separate.

## Data architecture

V7 currently has two safe data modes:

- Local built-in demo OHLCV data
- User-supplied OHLC CSV data

A licensed market-data provider will be added for live ticker lookup and intraday candles. The UI is intentionally separated from the data-provider layer so a provider can be changed later without rewriting the analyzer.

Expected CSV headers:

`time,open,high,low,close,volume`

At minimum the file must contain `open,high,low,close` and at least 30 valid candles.

## Next V7 work

1. Connect licensed live/delayed OHLCV market data and real ticker search.
2. Make timeframe switching load or aggregate actual timeframe-specific candles.
3. Add MACD, Bollinger Bands, volume analysis and volume profile.
4. Add stronger swing-point clustering and support/resistance zones rather than single levels.
5. Add breakout / retest / range / trend-state classification.
6. Add multi-timeframe confirmation.
7. Add watchlist and market scanner.
8. Add drawing tools and annotations.
9. Add deterministic tests for indicators, pattern formulas and decision scoring.
10. Backtest signal outcomes before describing conviction as any empirical probability.

## Important interpretation note

Candle Outlook provides chart-derived research output, not personalized investment advice. A chart signal can be invalidated by news, fundamentals, liquidity events, gaps, stale data or market structure outside the loaded candle history.