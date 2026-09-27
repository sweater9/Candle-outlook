// Candlestick pattern identification. `confidence` here is purely about
// how well the visible geometry matches the named pattern — it says
// nothing about whether the pattern is a good trade in this context.
// That separation (pattern confidence vs. trade conviction) is handled
// by scoring.js, which folds this confidence in as just one factor.

export function identifyPattern(candles) {
  const l = candles.at(-1);
  const p = candles.at(-2);
  const p2 = candles.at(-3);
  const ar = candles.slice(-12).reduce((s, x) => s + x.range, 0) / Math.min(12, candles.length);

  let name = 'No dominant named pattern';
  let bu = 0, be = 0, confidence = 46;
  let meaning = 'The latest candle does not form a strong standalone reversal pattern.';

  if (p2 && p2.dir < 0 && p.bodyRatio < 0.3 && l.dir > 0 && l.range >= p2.range * 0.8) {
    name = 'Morning-star-like reversal'; bu = 2; confidence = 84;
    meaning = 'Selling pressure appears to stall and buyers respond with a stronger recovery candle.';
  } else if (p2 && p2.dir > 0 && p.bodyRatio < 0.3 && l.dir < 0 && l.range >= p2.range * 0.8) {
    name = 'Evening-star-like reversal'; be = 2; confidence = 84;
    meaning = 'Buying pressure appears to stall and sellers respond with a stronger reversal candle.';
  } else if (l.bodyRatio < 0.2 && l.range > 0.55 * ar) {
    name = 'Doji-like indecision'; confidence = 72;
    meaning = 'Buyers and sellers are balanced; the next confirming candle matters more than the doji itself.';
  } else if (p && p.dir < 0 && l.dir > 0 && l.range > p.range * 1.15 && l.bodyRatio > 0.42) {
    name = 'Bullish engulfing-like reversal'; bu = 2; confidence = 90;
    meaning = 'The latest bullish candle overwhelms the prior bearish move, suggesting buyers have taken short-term control.';
  } else if (p && p.dir > 0 && l.dir < 0 && l.range > p.range * 1.15 && l.bodyRatio > 0.42) {
    name = 'Bearish engulfing-like reversal'; be = 2; confidence = 90;
    meaning = 'The latest bearish candle overwhelms the prior bullish move, suggesting sellers have taken short-term control.';
  } else if (l.wickRatio > 0.62 && l.bodyRatio < 0.38) {
    name = l.dir > 0 ? 'Hammer-like rejection' : 'Shooting-star-like rejection';
    l.dir > 0 ? (bu = 1) : (be = 1); confidence = 77;
    meaning = l.dir > 0
      ? 'Lower prices were rejected and buyers recovered part of the candle.'
      : 'Higher prices were rejected and sellers forced the candle back down.';
  } else if (l.bodyRatio > 0.72 && l.range > ar * 1.12) {
    name = l.dir > 0 ? 'Bullish marubozu-like impulse' : 'Bearish marubozu-like impulse';
    l.dir > 0 ? (bu = 2) : (be = 2); confidence = 82;
    meaning = l.dir > 0
      ? 'A large bullish body suggests decisive buying pressure.'
      : 'A large bearish body suggests decisive selling pressure.';
  }

  return { name, bu, be, confidence, meaning };
}
