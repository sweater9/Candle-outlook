# Candle Outlook — V2

Screenshot-first candlestick chart analysis that runs locally in the browser.

## V2 capabilities
- Upload or drag-and-drop a chart screenshot
- Local browser analysis; no screenshot is uploaded to a server
- Detect visible red/green candle groups
- Analyze recent trend direction and market structure
- Measure bullish/bearish candle momentum
- Detect impulse, rejection and indecision characteristics
- Identify whether price is near the upper/lower portion of the recent visible range
- Mark visible support and resistance directly on the uploaded chart
- Return Bullish / Bearish / Neutral outlook
- Rank primary and alternative technical scenarios
- Setup state: STRONG SETUP / DEVELOPING / WAIT / NO SETUP
- Explicit “What would change the view?” invalidation condition

## Confidence model
The 0–100 value is a **technical signal score**, not a guaranteed or statistically calibrated probability. V2 intentionally avoids inventing exact price levels from screenshot pixels.

## Privacy
Screenshot processing is performed locally in the browser in this version.

## Next accuracy layer
V3 should add robust candle body/wick segmentation, user-adjustable chart crop, more chart themes, named multi-candle patterns, swing-point clustering, annotated trigger/invalidation/target zones, optional market-data verification and outcome tracking/backtesting so confidence can eventually be calibrated against historical results.
