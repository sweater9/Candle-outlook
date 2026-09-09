# Candle Outlook — V1

A zero-backend browser prototype for uploading a candlestick chart screenshot and receiving a price-action outlook.

## What V1 does
- Upload / drag-and-drop chart screenshots
- Runs locally in the browser
- Detects common red/green candle pixels and groups them into visible candles
- Estimates recent direction, candle-color balance, latest-candle impulse, and trend/range character
- Returns Bullish / Bearish / Neutral bias, a signal-strength score, ranked scenarios, and invalidation logic

## Important limitation
The V1 score is a heuristic signal-strength score, **not** a statistically calibrated probability. Screenshot-only analysis cannot reliably know ticker metadata, exact OHLC, fundamentals, news, or future price.

## Run
Open `index.html` in a modern browser. No install or API key is required.

## Recommended V2
Add chart-area cropping, multiple TradingView color themes, exact candle-body/wick segmentation, OCR only for metadata/price scale where necessary, annotated-image output, optional market-data verification, and backtesting/calibration of setup scores.
