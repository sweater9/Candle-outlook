// Multi-timeframe alignment. Higher timeframes are weighted more heavily
// than lower ones: a bullish 5-minute candle against a strong 4-hour
// downtrend should not carry the same weight as the other way around.

export const TF_ORDER = ['5m', '15m', '1h', '4h', '1D', '1W'];
export const TF_RANK = TF_ORDER.reduce((m, tf, i) => ((m[tf] = i + 1), m), {});

export function sortByTimeframe(entries) {
  return [...entries].sort((a, b) => (TF_RANK[a.timeframe] || 0) - (TF_RANK[b.timeframe] || 0));
}

// Builds the plain-language multi-timeframe summary shown alongside the
// focus-timeframe analysis.
export function summarizeAlignment(mtfEntries, focusSign, focusTimeframe) {
  if (!mtfEntries || !mtfEntries.length) {
    return { aligned: null, text: 'Only one timeframe was analyzed — upload additional timeframes for multi-timeframe confirmation.' };
  }
  const sorted = sortByTimeframe(mtfEntries);
  const agreeing = sorted.filter((e) => (e.bias === 'bullish' && focusSign > 0) || (e.bias === 'bearish' && focusSign < 0));
  const conflicting = sorted.filter((e) => (e.bias === 'bullish' && focusSign < 0) || (e.bias === 'bearish' && focusSign > 0));
  const higherTf = sorted.filter((e) => (TF_RANK[e.timeframe] || 0) > (TF_RANK[focusTimeframe] || 0));
  const higherConflict = higherTf.some((e) => (e.bias === 'bullish' && focusSign < 0) || (e.bias === 'bearish' && focusSign > 0));

  let text;
  if (conflicting.length === 0) {
    text = `All analyzed timeframes (${sorted.map((e) => e.timeframe).join(', ')}) agree on the ${focusSign > 0 ? 'bullish' : 'bearish'} bias.`;
  } else if (higherConflict) {
    text = `A higher timeframe (${higherTf.filter((e) => (e.bias === 'bullish' && focusSign < 0) || (e.bias === 'bearish' && focusSign > 0)).map((e) => e.timeframe).join(', ')}) opposes this ${focusTimeframe} bias — treat this as a lower-conviction, counter-trend read.`;
  } else {
    text = `${conflicting.map((e) => e.timeframe).join(', ')} disagree with this bias, but they are lower timeframes than the ${higherTf.length ? 'aligned higher timeframes' : 'focus chart'}.`;
  }

  return { aligned: conflicting.length === 0, agreeing, conflicting, higherConflict, text };
}
