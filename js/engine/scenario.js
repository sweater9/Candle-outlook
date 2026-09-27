// Trade-plan / scenario construction: support & resistance levels, an
// optional pixel-to-price calibration (from two user-supplied reference
// prices — never fabricated), the measured-move trade plan, no-trade
// detection, and the primary/alternative scenario narrative.

function pixelBounds(candles) {
  return {
    topY: Math.min(...candles.map((c) => c.top)),
    bottomY: Math.max(...candles.map((c) => c.bottom)),
  };
}

// Support/resistance from the most recent confirmed swing points, falling
// back to the visible high/low when no swing was found in the window.
export function buildLevels(candles, structure, calibration) {
  const bounds = pixelBounds(candles);
  const resistanceY = structure.swingHigh ? structure.swingHigh.y : bounds.topY;
  const supportY = structure.swingLow ? structure.swingLow.y : bounds.bottomY;
  const levels = { resistanceY, supportY, calibrated: false };

  if (calibration && isFinite(calibration.highPrice) && isFinite(calibration.lowPrice) && calibration.highPrice > calibration.lowPrice) {
    const { highPrice, lowPrice } = calibration;
    const { topY, bottomY } = bounds;
    const span = Math.max(1, bottomY - topY);
    const priceAt = (y) => highPrice - ((y - topY) / span) * (highPrice - lowPrice);
    levels.priceAt = priceAt;
    levels.resistancePrice = priceAt(resistanceY);
    levels.supportPrice = priceAt(supportY);
    levels.calibrated = true;
  }
  return levels;
}

export function priceLabel(levels, y, fallback) {
  if (levels.calibrated) return `$${levels.priceAt(y).toFixed(2)}`;
  return fallback;
}

// Measured-move trade plan. R:R is a ratio of pixel distances, so it is
// meaningful even without a price calibration.
export function buildTradePlan(candles, levels, sign) {
  const ar = candles.slice(-14).reduce((s, c) => s + c.range, 0) / Math.min(14, candles.length);
  const buffer = Math.max(2, ar * 0.25);
  const rangeY = Math.max(4, levels.supportY - levels.resistanceY);
  // Entry is the current price, not the breakout trigger: risk is measured
  // from here down to the stop, reward from here up to the target, so a
  // setup already extended toward its confirmation level correctly scores
  // a worse R:R than one still sitting back near support/resistance.
  const entryY = candles.at(-1).mid;

  let confirmationY, invalidationY, stopY, t1Y, t2Y;
  if (sign > 0) {
    confirmationY = levels.resistanceY;
    invalidationY = levels.supportY;
    stopY = invalidationY + buffer;
    t1Y = confirmationY - rangeY;
    t2Y = confirmationY - rangeY * 2;
  } else {
    confirmationY = levels.supportY;
    invalidationY = levels.resistanceY;
    stopY = invalidationY - buffer;
    t1Y = confirmationY + rangeY;
    t2Y = confirmationY + rangeY * 2;
  }

  const riskY = Math.abs(stopY - entryY);
  const rewardY = Math.abs(t1Y - entryY);
  const rr = riskY > 0 ? rewardY / riskY : null;

  return { confirmationY, invalidationY, entryY, stopY, t1Y, t2Y, rr, rangeY, riskY, rewardY };
}

// Position-size helper: given account size and max risk (% or $), and a
// calibrated per-share/contract risk distance, returns a share count.
// Never fabricates a size when price isn't calibrated — returns null.
export function positionSize({ accountSize, riskPct, levels, plan }) {
  if (!levels.calibrated || !accountSize || !riskPct) return null;
  const riskDollars = accountSize * (riskPct / 100);
  const entryPrice = levels.priceAt(plan.entryY);
  const stopPrice = levels.priceAt(plan.stopY);
  const perShareRisk = Math.abs(entryPrice - stopPrice);
  if (perShareRisk <= 0) return null;
  const shares = Math.floor(riskDollars / perShareRisk);
  return { riskDollars, entryPrice, stopPrice, perShareRisk, shares };
}

// "Sometimes WAIT is the most informative output." Hard no-trade gates —
// any one of these overrides an otherwise-directional read.
export function evaluateNoTrade({ quality, candleCount, rr, structure, levels, lastCandle, mtfEntries, sign }) {
  const reasons = [];
  if (quality < 48) reasons.push('Image-read quality is too low to trust the candle geometry.');
  if (candleCount < 7) reasons.push('Too few candles are visible to establish reliable structure.');
  if (rr != null && rr < 1.3) reasons.push(`Risk:reward is weak (about 1:${rr.toFixed(1)}) — below the 1:1.3 this engine requires before favoring a trade.`);
  if (structure.trend === 'range' && structure.consolidating) reasons.push('Price is range-bound / consolidating with no clear directional structure.');

  const span = Math.max(1, levels.supportY - levels.resistanceY);
  const pos = (lastCandle.mid - levels.resistanceY) / span;
  if (pos > 0.4 && pos < 0.6) reasons.push('Price is trapped mid-range between visible support and resistance, far from either level.');

  if (mtfEntries && mtfEntries.length) {
    const conflicts = mtfEntries.filter((e) => (e.bias === 'bullish' && sign < 0) || (e.bias === 'bearish' && sign > 0));
    if (conflicts.length >= Math.ceil(mtfEntries.length / 2)) reasons.push('Higher-weight timeframes contradict this thesis.');
  }

  return { flagged: reasons.length > 0, reasons };
}

// Primary + alternative scenario narrative, matching the "this is not a
// single guaranteed outcome" framing.
export function buildScenario({ sign, levels, plan, ticker }) {
  const name = ticker || 'this chart';
  const dir = sign > 0 ? 'BUY' : 'SELL';
  const oppositeDir = sign > 0 ? 'bearish' : 'bullish';
  const confirmLabel = priceLabel(levels, plan.confirmationY, sign > 0 ? 'the visible resistance level' : 'the visible support level');
  const invalidLabel = priceLabel(levels, plan.invalidationY, sign > 0 ? 'the visible support level' : 'the visible resistance level');
  const t1Label = priceLabel(levels, plan.t1Y, 'the first measured-move target');
  const t2Label = priceLabel(levels, plan.t2Y, 'the extended measured-move target');

  const primary = `${dir} bias on ${name} above ${confirmLabel}; confirmation on a decisive close through that level; invalidated on a close beyond ${invalidLabel}.`;
  const alternative = `If price closes beyond ${invalidLabel}, this ${sign > 0 ? 'bullish' : 'bearish'} structure fails and a ${oppositeDir} continuation becomes more plausible.`;

  return { primary, alternative, confirmLabel, invalidLabel, t1Label, t2Label };
}
