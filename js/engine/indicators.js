// Real momentum indicators computed from each candle's estimated close
// (geometry.js's estClose — the colored-body edge that represents where
// the candle closed). Everything here works in pixel-y space, where a
// SMALLER y means a HIGHER price (image y grows downward) — every
// comparison below is written with that inversion in mind.

// Wilder's RSI. Returns an array the same length as `candles`; entries
// before the first full `period` window are null.
export function computeRSI(candles, period = 14) {
  const closes = candles.map((c) => Number.isFinite(c.close) ? -c.close : c.estClose);
  const rsi = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i - 1] - closes[i]; // y decreasing = price rose
    if (change > 0) gains += change; else losses += -change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i - 1] - closes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// Exponential moving average, seeded with a plain average of the first
// `period` closes. Returns an array the same length as `candles`.
export function computeEMA(candles, period) {
  const closes = candles.map((c) => Number.isFinite(c.close) ? -c.close : c.estClose);
  const ema = new Array(closes.length).fill(null);
  if (closes.length < period) return ema;

  const k = 2 / (period + 1);
  let value = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = value;
  for (let i = period; i < closes.length; i++) {
    value = closes[i] * k + value * (1 - k);
    ema[i] = value;
  }
  return ema;
}

// Compares price at the last two confirmed swing highs / lows against
// RSI at those same candle indices. A higher price high with a lower
// RSI high (or the mirror at lows) is classic momentum divergence.
export function detectDivergence(swings, rsiSeries) {
  const events = [];
  const { highs, lows } = swings;

  if (highs.length >= 2) {
    const h2 = highs.at(-1), h1 = highs.at(-2);
    const r2 = rsiSeries[h2.i], r1 = rsiSeries[h1.i];
    if (r1 != null && r2 != null) {
      const priceHigherHigh = h2.y < h1.y;
      const rsiLowerHigh = r2 < r1;
      if (priceHigherHigh && rsiLowerHigh) {
        events.push({ type: 'bearish-rsi-divergence', label: 'Price made a higher high while RSI made a lower high — bearish momentum divergence' });
      }
    }
  }
  if (lows.length >= 2) {
    const l2 = lows.at(-1), l1 = lows.at(-2);
    const r2 = rsiSeries[l2.i], r1 = rsiSeries[l1.i];
    if (r1 != null && r2 != null) {
      const priceLowerLow = l2.y > l1.y;
      const rsiHigherLow = r2 > r1;
      if (priceLowerLow && rsiHigherLow) {
        events.push({ type: 'bullish-rsi-divergence', label: 'Price made a lower low while RSI made a higher low — bullish momentum divergence' });
      }
    }
  }
  return events;
}

// Convenience bundle for analyze.js: the latest RSI/EMA readings plus
// any divergence events, or null fields when there isn't enough history.
export function computeMomentumIndicators(candles, swings) {
  const rsiSeries = computeRSI(candles, 14);
  const emaFastSeries = computeEMA(candles, 9);
  const emaSlowSeries = computeEMA(candles, 21);
  const divergences = detectDivergence(swings, rsiSeries);
  return {
    rsi: rsiSeries.at(-1),
    emaFast: emaFastSeries.at(-1),
    emaSlow: emaSlowSeries.at(-1),
    divergences,
  };
}
