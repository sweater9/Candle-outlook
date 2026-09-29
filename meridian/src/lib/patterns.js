// Deterministic candlestick pattern detection over loaded OHLC. Classification only; no forecasts.
const body = (c) => Math.abs(c.close - c.open);
const range = (c) => c.high - c.low;
const upper = (c) => c.high - Math.max(c.open, c.close);
const lower = (c) => Math.min(c.open, c.close) - c.low;
const bull = (c) => c.close > c.open;
const bear = (c) => c.close < c.open;

export const PATTERN_LIBRARY = [
  { name: "Doji", bias: "neutral", text: "Open and close nearly equal: indecision between buyers and sellers." },
  { name: "Hammer", bias: "bullish", text: "Small body, long lower wick after weakness: sellers pushed down but buyers recovered." },
  { name: "Shooting Star", bias: "bearish", text: "Small body, long upper wick after strength: buyers pushed up but sellers took over." },
  { name: "Bullish Engulfing", bias: "bullish", text: "A green candle whose body covers the prior red body: buyers took control." },
  { name: "Bearish Engulfing", bias: "bearish", text: "A red candle whose body covers the prior green body: sellers took control." },
  { name: "Bullish Marubozu", bias: "bullish", text: "Long green body with almost no wicks: buyers dominated the session." },
  { name: "Bearish Marubozu", bias: "bearish", text: "Long red body with almost no wicks: sellers dominated the session." },
  { name: "Sideways", bias: "neutral", text: "Small bodies and overlapping ranges: no clear direction." },
];

export function detectAt(candles, i) {
  const c = candles[i], p = candles[i - 1];
  const r = range(c);
  if (!r) return null;
  if (body(c) / r < 0.1) return "Doji";
  if (body(c) / r > 0.9) return bull(c) ? "Bullish Marubozu" : "Bearish Marubozu";
  if (p && bull(c) && bear(p) && c.close >= p.open && c.open <= p.close) return "Bullish Engulfing";
  if (p && bear(c) && bull(p) && c.open >= p.close && c.close <= p.open) return "Bearish Engulfing";
  if (lower(c) >= 2 * body(c) && upper(c) <= body(c) && body(c) / r < 0.4) return "Hammer";
  if (upper(c) >= 2 * body(c) && lower(c) <= body(c) && body(c) / r < 0.4) return "Shooting Star";
  return null;
}

export function detectAll(candles) {
  const out = [];
  for (let i = 1; i < candles.length; i++) {
    const name = detectAt(candles, i);
    if (name) out.push({ index: i, name, time: candles[i].time });
  }
  return out;
}

// Per-candle class for the block scan.
export function classify(c) {
  const r = range(c);
  if (!r || body(c) / r < 0.1) return "neutral";
  return bull(c) ? "bullish" : "bearish";
}

export function biasWindow(candles, n) {
  const w = candles.slice(-n);
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  w.forEach((c) => { counts[classify(c)] += 1; });
  const total = w.length || 1;
  const bullPct = (counts.bullish / total) * 100, bearPct = (counts.bearish / total) * 100;
  const label = bullPct - bearPct >= 20 ? "BULLISH" : bearPct - bullPct >= 20 ? "BEARISH" : "MIXED";
  return { n: w.length, counts, bullPct, bearPct, neutralPct: (counts.neutral / total) * 100, label };
}

// Backtest over the loaded window: how often a close N bars later was higher. Historical, not a forecast.
export function reliability(candles, patterns, horizon) {
  const stats = {};
  patterns.forEach(({ index, name }) => {
    const future = candles[index + horizon];
    if (!future) return;
    const s = (stats[name] ||= { name, n: 0, higher: 0, sumMove: 0 });
    s.n += 1;
    if (future.close > candles[index].close) s.higher += 1;
    s.sumMove += (future.close / candles[index].close - 1) * 100;
  });
  return Object.values(stats).map((s) => ({ ...s, pct: (s.higher / s.n) * 100, avgMove: s.sumMove / s.n }));
}
