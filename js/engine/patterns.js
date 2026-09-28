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

  const threeSoldiers = p2 && p2.dir > 0 && p.dir > 0 && l.dir > 0
    && p2.bodyRatio > 0.45 && p.bodyRatio > 0.45 && l.bodyRatio > 0.45
    && p.mid < p2.mid && l.mid < p.mid;
  const threeCrows = p2 && p2.dir < 0 && p.dir < 0 && l.dir < 0
    && p2.bodyRatio > 0.45 && p.bodyRatio > 0.45 && l.bodyRatio > 0.45
    && p.mid > p2.mid && l.mid > p.mid;
  // Pixel y grows downward (smaller y = higher price), so "opened below
  // the prior close" is a LARGER y than that close, and "closed above
  // the prior body's midpoint" is a SMALLER y than that midpoint.
  const piercingLine = p && p.dir < 0 && l.dir > 0
    && l.estOpen > p.estClose && l.estClose < (p.bodyTop + p.bodyBottom) / 2 && l.estClose > p.estOpen;
  const darkCloudCover = p && p.dir > 0 && l.dir < 0
    && l.estOpen < p.estClose && l.estClose > (p.bodyTop + p.bodyBottom) / 2 && l.estClose < p.estOpen;
  const tweezerTop = p && Math.abs(p.top - l.top) < ar * 0.15 && l.dir < 0 && p.dir > 0;
  const tweezerBottom = p && Math.abs(p.bottom - l.bottom) < ar * 0.15 && l.dir > 0 && p.dir < 0;
  const insideBar = p && l.top > p.top && l.bottom < p.bottom && l.range < p.range * 0.7;

  if (threeSoldiers) {
    name = 'Three-white-soldiers-like continuation'; bu = 3; confidence = 88;
    meaning = 'Three consecutive strong bullish candles with progressively higher closes suggest sustained buying control.';
  } else if (threeCrows) {
    name = 'Three-black-crows-like continuation'; be = 3; confidence = 88;
    meaning = 'Three consecutive strong bearish candles with progressively lower closes suggest sustained selling control.';
  } else if (p2 && p2.dir < 0 && p.bodyRatio < 0.3 && l.dir > 0 && l.range >= p2.range * 0.8) {
    name = 'Morning-star-like reversal'; bu = 2; confidence = 84;
    meaning = 'Selling pressure appears to stall and buyers respond with a stronger recovery candle.';
  } else if (p2 && p2.dir > 0 && p.bodyRatio < 0.3 && l.dir < 0 && l.range >= p2.range * 0.8) {
    name = 'Evening-star-like reversal'; be = 2; confidence = 84;
    meaning = 'Buying pressure appears to stall and sellers respond with a stronger reversal candle.';
  } else if (l.bodyRatio < 0.2 && l.range > 0.55 * ar) {
    name = 'Doji-like indecision'; confidence = 72;
    meaning = 'Buyers and sellers are balanced; the next confirming candle matters more than the doji itself.';
  } else if (piercingLine) {
    name = 'Piercing-line-like reversal'; bu = 2; confidence = 80;
    meaning = 'The bullish candle opened below the prior close but recovered past the midpoint of the prior bearish body, without fully engulfing it.';
  } else if (darkCloudCover) {
    name = 'Dark-cloud-cover-like reversal'; be = 2; confidence = 80;
    meaning = 'The bearish candle opened above the prior close but fell past the midpoint of the prior bullish body, without fully engulfing it.';
  } else if (p && p.dir < 0 && l.dir > 0 && l.range > p.range * 1.15 && l.bodyRatio > 0.42) {
    name = 'Bullish engulfing-like reversal'; bu = 2; confidence = 90;
    meaning = 'The latest bullish candle overwhelms the prior bearish move, suggesting buyers have taken short-term control.';
  } else if (p && p.dir > 0 && l.dir < 0 && l.range > p.range * 1.15 && l.bodyRatio > 0.42) {
    name = 'Bearish engulfing-like reversal'; be = 2; confidence = 90;
    meaning = 'The latest bearish candle overwhelms the prior bullish move, suggesting sellers have taken short-term control.';
  } else if (tweezerTop) {
    name = 'Tweezer-top-like rejection'; be = 1; confidence = 68;
    meaning = 'Two consecutive candles stalled at almost the same high, suggesting a shared resistance rejection.';
  } else if (tweezerBottom) {
    name = 'Tweezer-bottom-like rejection'; bu = 1; confidence = 68;
    meaning = 'Two consecutive candles stalled at almost the same low, suggesting a shared support rejection.';
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
  } else if (insideBar) {
    name = 'Inside-bar-like consolidation'; confidence = 65;
    meaning = 'The latest candle traded entirely inside the prior candle\'s range — indecision/consolidation rather than a directional signal on its own.';
  }

  return { name, bu, be, confidence, meaning };
}
