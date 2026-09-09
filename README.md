# Candle Outlook — V6

Screenshot-first candlestick chart analysis that runs locally in the browser.

## What V6 does

Candle Outlook turns a candlestick screenshot into a structured technical read rather than pretending to predict the future.

Workflow:

`UPLOAD → READ CANDLES → SCORE BULL/BEAR EVIDENCE → CHART SIGNAL → CONFIRMATION → INVALIDATION`

### Chart signals

- **BUY BIAS** — strong bullish technical alignment
- **LEAN BUY · WAIT FOR CONFIRMATION** — bullish evidence leads but confirmation is incomplete
- **HOLD / WAIT** — mixed evidence or no clear technical edge
- **LEAN SELL · WAIT FOR CONFIRMATION** — bearish evidence leads but confirmation is incomplete
- **SELL BIAS** — strong bearish technical alignment
- **NO SIGNAL** — screenshot quality is insufficient for a responsible read

These labels are technical chart signals, not instructions to transact.

## Evidence framework

V6 separately scores bullish and bearish evidence for:

1. Candle pattern
2. Market structure / trend
3. Support / resistance location
4. Volume confirmation — N/A until reliably detectable
5. Momentum / indicators — only evidence the local engine can actually infer is scored

Unavailable evidence is not silently treated as confirmation.

## Key concepts

### Conviction
How strongly the overall independent chart factors agree. High conviction requires multiple factors to align and sufficient image-read quality. It is not a probability that price will move in the predicted direction.

### Pattern read
The candlestick formation the latest visible candle or sequence most closely resembles. The engine deliberately uses terms such as `hammer-like` or `engulfing-like` when exact OHLC geometry cannot be guaranteed from screenshot pixels.

### Pattern confidence
Confidence in the pattern identification itself. This is separate from directional conviction. A high-confidence candle pattern can still produce low or medium overall conviction if trend, location or momentum disagrees.

## V5/V6 accuracy layer

- Estimated candle body-to-range geometry
- Estimated wick proportion
- Doji-like indecision detection
- Hammer/shooting-star-like rejection detection
- Bullish/bearish engulfing-like detection
- Marubozu/impulse detection
- Image-read quality gate
- Refuses analysis when too few reliable candles can be isolated
- Visible support/resistance overlays
- No fabricated exact OHLC or price levels

## Privacy

Screenshot processing is performed locally in the browser. The current static version does not upload the screenshot to a backend.

## Important limitations

The current deterministic pixel engine works best with conventional green/red candlestick charts. Pattern geometry is estimated from screenshot pixels, not source OHLC data. Volume and indicator panels are not yet reliably interpreted. Support/resistance overlays are approximate image-space levels. A single screenshot may omit timeframe, scale, prior history, news, fundamentals and gaps outside the visible chart.

## Next accuracy work

Priority is validation rather than adding cosmetic features:

1. Test against real TradingView and IBKR screenshots across light/dark themes.
2. Improve candle separation and true body/wick segmentation.
3. Cluster swing highs/lows into stronger support/resistance zones.
4. Distinguish wick probes from confirmed closes beyond a level.
5. Detect volume panels and common indicators only when reliable.
6. Add deterministic synthetic tests for pattern formulas and scoring.
7. Add screenshot paste and preserve/redraw annotations on resize.
8. Later, optionally verify screenshot observations against licensed OHLCV data when ticker/timeframe are known.
9. Backtest signal outcomes before ever describing confidence as an empirical probability.

## Safety of interpretation

Candle Outlook is chart-pattern analysis, not a prediction. News, fundamentals, liquidity events and price action outside the screenshot can materially change the outcome.