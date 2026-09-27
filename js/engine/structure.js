// Market-structure engine: swing detection, HH/HL/LH/LL classification,
// trend-break / consolidation / breakout-retest / liquidity-sweep /
// failed-breakout detection. All in pixel space — remember smaller `top`
// / `bottom` y-values mean a HIGHER price, since image y grows downward.

function avgRange(candles) {
  const n = Math.min(14, candles.length);
  const slice = candles.slice(-n);
  return slice.reduce((s, c) => s + c.range, 0) / Math.max(1, n);
}

// Fractal swing points: a candle is a swing high if its `top` is the
// lowest (highest price) among `window` neighbors on each side, and a
// swing low if its `bottom` is the highest (lowest price) among neighbors.
export function findSwings(candles, window = 2) {
  const highs = [], lows = [];
  for (let i = window; i < candles.length - window; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let k = 1; k <= window; k++) {
      if (candles[i - k].top < c.top || candles[i + k].top < c.top) isHigh = false;
      if (candles[i - k].bottom > c.bottom || candles[i + k].bottom > c.bottom) isLow = false;
    }
    if (isHigh) highs.push({ i, y: c.top });
    if (isLow) lows.push({ i, y: c.bottom });
  }
  return { highs, lows };
}

function tagSwings(points, tol, kind) {
  return points.map((p, idx) => {
    if (idx === 0) return { ...p, tag: kind === 'high' ? 'H' : 'L' };
    const prev = points[idx - 1];
    if (kind === 'high') {
      if (p.y < prev.y - tol) return { ...p, tag: 'HH' };
      if (p.y > prev.y + tol) return { ...p, tag: 'LH' };
      return { ...p, tag: 'EH' };
    }
    if (p.y < prev.y - tol) return { ...p, tag: 'HL' };
    if (p.y > prev.y + tol) return { ...p, tag: 'LL' };
    return { ...p, tag: 'EL' };
  });
}

function deriveTrend(tHighs, tLows) {
  const rh = tHighs.slice(-2).map((h) => h.tag);
  const rl = tLows.slice(-2).map((l) => l.tag);
  const bull = rh.filter((t) => t === 'HH').length + rl.filter((t) => t === 'HL').length;
  const bear = rh.filter((t) => t === 'LH').length + rl.filter((t) => t === 'LL').length;
  if (bull >= 2 && bear === 0) return 'uptrend';
  if (bear >= 2 && bull === 0) return 'downtrend';
  if (bull > 0 && bear > 0) return 'transitional';
  if (bull === 1 && bear === 0) return 'uptrend-early';
  if (bear === 1 && bull === 0) return 'downtrend-early';
  return 'range';
}

function detectConsolidation(tHighs, tLows, tol) {
  const flatHighs = tHighs.filter((h) => h.tag === 'EH').length;
  const flatLows = tLows.filter((l) => l.tag === 'EL').length;
  const span = (arr) => (arr.length ? Math.max(...arr.map((p) => p.y)) - Math.min(...arr.map((p) => p.y)) : Infinity);
  const tight = span(tHighs) < tol * 3 && span(tLows) < tol * 3;
  return tight || flatHighs + flatLows >= 2;
}

function detectTrendBreak(trend, tHighs, tLows) {
  const lastHigh = tHighs.at(-1), lastLow = tLows.at(-1);
  if (trend === 'uptrend' && lastLow && lastLow.tag === 'LL') {
    return { broke: true, direction: 'down', label: 'Uptrend structure broken — a lower low has formed' };
  }
  if (trend === 'downtrend' && lastHigh && lastHigh.tag === 'HH') {
    return { broke: true, direction: 'up', label: 'Downtrend structure broken — a higher high has formed' };
  }
  return { broke: false, direction: null, label: null };
}

// A candle's wick pierces beyond the last confirmed swing extreme but its
// estimated close stays back inside — classic liquidity-sweep / stop-hunt.
function detectLiquiditySweeps(candles, highs, lows, tol) {
  const events = [];
  const lastSwingHigh = highs.at(-1);
  const lastSwingLow = lows.at(-1);
  const from = Math.max(0, candles.length - 6);
  for (let i = from; i < candles.length; i++) {
    const c = candles[i];
    if (lastSwingHigh && i > lastSwingHigh.i && c.top < lastSwingHigh.y - tol * 0.4 && c.estClose > lastSwingHigh.y + tol * 0.2) {
      events.push({ type: 'liquidity-sweep-high', index: i, label: 'Wick swept above the prior swing high but closed back below it — possible liquidity sweep / bull trap' });
    }
    if (lastSwingLow && i > lastSwingLow.i && c.bottom > lastSwingLow.y + tol * 0.4 && c.estClose < lastSwingLow.y - tol * 0.2) {
      events.push({ type: 'liquidity-sweep-low', index: i, label: 'Wick swept below the prior swing low but closed back above it — possible liquidity sweep / bear trap' });
    }
  }
  return events;
}

// Close beyond a level, then close back inside within the next few candles.
function detectFailedBreakouts(candles, highs, lows, tol) {
  const events = [];
  const checkLevel = (level, isHigh) => {
    if (!level) return;
    for (let i = level.i + 1; i < Math.min(candles.length, level.i + 6); i++) {
      const c = candles[i];
      const brokeOut = isHigh ? c.estClose < level.y - tol * 0.3 : c.estClose > level.y + tol * 0.3;
      if (brokeOut) {
        for (let j = i + 1; j < Math.min(candles.length, i + 4); j++) {
          const back = candles[j];
          const failedBack = isHigh ? back.estClose > level.y : back.estClose < level.y;
          if (failedBack) {
            events.push({
              type: isHigh ? 'failed-breakout-high' : 'failed-breakout-low',
              index: j,
              label: isHigh
                ? 'Price broke above resistance then closed back below it within a few candles — failed breakout'
                : 'Price broke below support then closed back above it within a few candles — failed breakdown',
            });
            break;
          }
        }
        break;
      }
    }
  };
  checkLevel(highs.at(-1), true);
  checkLevel(lows.at(-1), false);
  return events;
}

// Close beyond a level, pull back close to it without re-crossing, then
// (optionally) resume — a breakout-and-retest.
function detectBreakoutRetest(candles, highs, lows, tol) {
  const events = [];
  const checkLevel = (level, isHigh) => {
    if (!level) return;
    let brokeAt = -1;
    for (let i = level.i + 1; i < candles.length; i++) {
      const c = candles[i];
      const brokeOut = isHigh ? c.estClose < level.y - tol * 0.3 : c.estClose > level.y + tol * 0.3;
      if (brokeOut) { brokeAt = i; break; }
    }
    if (brokeAt === -1) return;
    for (let j = brokeAt + 1; j < candles.length; j++) {
      const c = candles[j];
      const near = Math.abs((isHigh ? c.top : c.bottom) - level.y) < tol;
      const reCrossed = isHigh ? c.estClose > level.y + tol * 0.3 : c.estClose < level.y - tol * 0.3;
      if (reCrossed) return; // level reclaimed — no clean retest
      if (near) {
        events.push({
          type: isHigh ? 'breakout-retest-high' : 'breakout-retest-low',
          index: j,
          label: isHigh
            ? 'Price broke above the level and is retesting it from above — a hold here favors continuation'
            : 'Price broke below the level and is retesting it from below — a hold here favors continuation',
        });
        return;
      }
    }
  };
  checkLevel(highs.at(-1), true);
  checkLevel(lows.at(-1), false);
  return events;
}

// Full structure read for one array of candles (already trimmed to the
// working window the caller wants to analyze).
export function analyzeStructure(candles) {
  const ar = avgRange(candles);
  const tol = Math.max(1.5, ar * 0.15);
  const { highs, lows } = findSwings(candles, 2);
  const tHighs = tagSwings(highs, tol, 'high');
  const tLows = tagSwings(lows, tol, 'low');
  const trend = deriveTrend(tHighs, tLows);
  const consolidating = detectConsolidation(tHighs, tLows, tol);
  const trendBreak = detectTrendBreak(trend, tHighs, tLows);
  const sweeps = detectLiquiditySweeps(candles, highs, lows, tol);
  const failedBreakouts = detectFailedBreakouts(candles, highs, lows, tol);
  const retests = detectBreakoutRetest(candles, highs, lows, tol);

  const labels = {
    uptrend: 'Higher highs and higher lows — uptrend',
    'uptrend-early': 'Early higher-low forming — tentative uptrend',
    downtrend: 'Lower highs and lower lows — downtrend',
    'downtrend-early': 'Early lower-high forming — tentative downtrend',
    transitional: 'Mixed swing sequence — structure shift in progress',
    range: 'No clean directional swing sequence — range / consolidation',
  };

  return {
    tol,
    highs, lows, tHighs, tLows,
    trend,
    label: consolidating && (trend === 'range' || trend === 'transitional') ? 'Consolidation — price is coiling inside a tight range' : labels[trend],
    consolidating,
    trendBreak,
    events: [...sweeps, ...failedBreakouts, ...retests],
    swingHigh: highs.at(-1) || null,
    swingLow: lows.at(-1) || null,
  };
}
