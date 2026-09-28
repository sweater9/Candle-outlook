// Composes the individual engine modules into one full read of a single
// screenshot. This is the function app.js calls per uploaded chart; MTF
// combination (running this once per timeframe, then re-scoring the
// focus chart with the others as context) lives in app.js using mtf.js.

import { analyzeStructure } from './structure.js';
import { identifyPattern } from './patterns.js';
import { determineBias, scoreSetup } from './scoring.js';
import { buildLevels, buildTradePlan, evaluateNoTrade, buildScenario, positionSize } from './scenario.js';
import { computeMomentumIndicators } from './indicators.js';

export function runAnalysis({ candles, quality, ticker, timeframeLabel, calibration, volumeContext, eventRisk, mtfEntries, account }) {
  if (quality < 48 || candles.length < 7) {
    return {
      error: true,
      quality,
      candleCount: candles.length,
      reasonsText: `Image-read quality is ${quality}/100 with ${candles.length} detected candles. There is not enough reliable candle geometry for a directional read.`,
    };
  }

  const working = candles.slice(-Math.min(60, candles.length));
  const structure = analyzeStructure(working);
  const pattern = identifyPattern(working);
  const bias = determineBias(pattern, structure, working);
  const indicators = computeMomentumIndicators(working, structure);

  if (bias === 'mixed') {
    return {
      error: false,
      decision: 'WAIT',
      bias,
      sign: null,
      quality,
      candles: working,
      structure,
      pattern,
      indicators,
      levels: null,
      plan: null,
      scenario: null,
      sizing: null,
      ticker,
      timeframeLabel,
      conviction: 0,
      scorecard: { conviction: 0, factors: {}, strengths: [], weaknesses: ['Pattern, structure and recent momentum do not agree on a direction.'], neutral: [] },
      noTrade: { flagged: true, reasons: ['Bullish and bearish evidence is too balanced to form a directional thesis.'] },
    };
  }

  const sign = bias === 'bullish' ? 1 : -1;
  const levels = buildLevels(working, structure, calibration);
  const plan = buildTradePlan(working, levels, sign);
  const scorecard = scoreSetup({ candles: working, structure, pattern, levels, sign, rr: plan.rr, volumeContext, mtfEntries, eventRisk, indicators });
  const noTrade = evaluateNoTrade({ quality, candleCount: working.length, rr: plan.rr, structure, levels, lastCandle: working.at(-1), mtfEntries, sign });
  const scenario = buildScenario({ sign, levels, plan, ticker });
  const sizing = account ? positionSize({ accountSize: account.size, riskPct: account.riskPct, levels, plan }) : null;

  let decision = sign > 0 ? 'BUY' : 'SELL';
  if (noTrade.flagged || scorecard.conviction < 55) decision = 'WAIT';

  return {
    error: false,
    quality,
    candles: working,
    structure,
    pattern,
    indicators,
    bias,
    sign,
    levels,
    plan,
    scorecard,
    noTrade,
    scenario,
    sizing,
    decision,
    conviction: scorecard.conviction,
    ticker,
    timeframeLabel,
  };
}
