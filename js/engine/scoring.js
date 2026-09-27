// Deterministic setup-quality scoring engine. The vision/pixel layer
// (geometry.js, structure.js, patterns.js) identifies chart *features*;
// this module is the only place that turns those features into numbers.
// Every factor is scored 0-10 from concrete, inspectable inputs — never
// a single opaque "AI confidence" figure — and combined with fixed
// weights into one 0-100 conviction score. Pattern-ID confidence
// (patterns.js) is intentionally kept separate from this conviction.

import { TF_RANK } from './mtf.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Which directional bias each structure event supports (+1 bullish, -1 bearish).
const EVENT_BIAS = {
  'liquidity-sweep-high': -1,
  'liquidity-sweep-low': 1,
  'failed-breakout-high': -1,
  'failed-breakout-low': 1,
  'breakout-retest-high': 1,
  'breakout-retest-low': -1,
};

const BASE_WEIGHTS = {
  structure: 0.22,
  sr: 0.16,
  candle: 0.16,
  volume: 0.10,
  momentum: 0.16,
  rr: 0.10,
  context: 0.10,
};

function buildWeights(hasMtf) {
  if (!hasMtf) return { ...BASE_WEIGHTS, mtf: 0 };
  const scaled = {};
  for (const k in BASE_WEIGHTS) scaled[k] = BASE_WEIGHTS[k] * 0.85;
  scaled.mtf = 0.15;
  return scaled;
}

function recentBullShare(candles, n = 8) {
  const recent = candles.slice(-n);
  return recent.filter((c) => c.dir > 0).length / recent.length;
}

// Bias comes from an independent vote across pattern, structure and
// recent momentum — no single candle decides the thesis.
export function determineBias(pattern, structure, candles) {
  let bu = 0, be = 0;
  if (pattern.bu > pattern.be) bu++; else if (pattern.be > pattern.bu) be++;
  if (structure.trend === 'uptrend' || structure.trend === 'uptrend-early') bu++;
  if (structure.trend === 'downtrend' || structure.trend === 'downtrend-early') be++;
  const bullShare = recentBullShare(candles);
  if (bullShare >= 0.58) bu++;
  if (bullShare <= 0.42) be++;
  if (bu > be) return 'bullish';
  if (be > bu) return 'bearish';
  return 'mixed';
}

function structureScore(structure, sign) {
  const trendVal = { uptrend: 2, 'uptrend-early': 1, range: 0, transitional: 0, downtrend: -2, 'downtrend-early': -1 }[structure.trend] ?? 0;
  let score = clamp(5 + trendVal * sign * 2, 0, 10);
  const notes = [];
  if (sign * trendVal > 0) notes.push(`Market structure (${structure.label.toLowerCase()}) supports this thesis.`);
  else if (sign * trendVal < 0) notes.push(`Market structure (${structure.label.toLowerCase()}) works against this thesis.`);
  else notes.push(`Market structure (${structure.label.toLowerCase()}) is not clearly directional.`);

  if (structure.consolidating) {
    score = Math.min(score, 5);
    notes.push('Price is consolidating, which caps structural conviction until it resolves.');
  }

  if (structure.trendBreak.broke) {
    const brokeSign = structure.trendBreak.direction === 'up' ? 1 : -1;
    if (brokeSign === sign) {
      score = clamp(score + 1, 0, 10);
      notes.push(`${structure.trendBreak.label}, supporting this thesis.`);
    } else {
      score = clamp(score - 3, 0, 10);
      notes.push(`${structure.trendBreak.label}, which contradicts this thesis.`);
    }
  }

  for (const e of structure.events) {
    const evSign = EVENT_BIAS[e.type];
    if (evSign === undefined) continue;
    if (evSign === sign) { score = clamp(score + 1, 0, 10); notes.push(`${e.label}.`); }
    else { score = clamp(score - 1, 0, 10); notes.push(`${e.label}, which works against this thesis.`); }
  }

  return { score: Math.round(score), notes };
}

function srScore(levels, lastCandle, sign) {
  const span = Math.max(1, levels.supportY - levels.resistanceY);
  const pos = clamp((lastCandle.mid - levels.resistanceY) / span, 0, 1); // 0 at resistance, 1 at support
  const notes = [];
  let score;
  if (sign > 0) {
    score = 10 * pos;
    if (pos > 0.65) notes.push('Price is trading near the support / lower end of the visible range, leaving room to the upside.');
    else if (pos < 0.35) notes.push('Price is already extended toward resistance, leaving less room to the upside.');
    if (lastCandle.dir > 0 && pos > 0.55) score = clamp(score + 1, 0, 10);
  } else {
    score = 10 * (1 - pos);
    if (pos < 0.35) notes.push('Price is trading near the resistance / upper end of the visible range, leaving room to the downside.');
    else if (pos > 0.65) notes.push('Price is already extended toward support, leaving less room to the downside.');
    if (lastCandle.dir < 0 && pos < 0.45) score = clamp(score + 1, 0, 10);
  }
  return { score: Math.round(clamp(score, 0, 10)), notes, pos };
}

function momentumScore(candles, sign) {
  const recent = candles.slice(-8);
  const bullShare = recent.filter((c) => c.dir > 0).length / recent.length;
  const momentumVal = (bullShare - 0.5) * 2; // -1..1
  let score = clamp(5 + momentumVal * sign * 5, 0, 10);
  const notes = [];

  const last3 = candles.slice(-3);
  const prior5 = candles.slice(-8, -3);
  const a3 = last3.reduce((s, c) => s + c.range, 0) / Math.max(1, last3.length);
  const a5 = prior5.length ? prior5.reduce((s, c) => s + c.range, 0) / prior5.length : a3;
  const accelerating = a3 > a5 * 1.15;
  const decelerating = a3 < a5 * 0.75;
  const lastDirSign = candles.at(-1).dir;

  if (accelerating && lastDirSign === sign) {
    score = clamp(score + 1, 0, 10);
    notes.push('Recent candle ranges are expanding in the direction of this thesis (momentum acceleration).');
  }
  if (decelerating) {
    score = clamp(score - 1, 0, 10);
    notes.push('Recent candle ranges are contracting, a sign of momentum exhaustion.');
  }
  const share = sign > 0 ? bullShare : 1 - bullShare;
  notes.push(`${Math.round(share * 100)}% of the last ${recent.length} candles are ${sign > 0 ? 'bullish' : 'bearish'}-colored.`);
  return { score: Math.round(score), notes, bullShare };
}

function candleScore(pattern, lastCandle, sign) {
  const notes = [];
  const patDirSign = pattern.bu > pattern.be ? 1 : pattern.be > pattern.bu ? -1 : 0;
  let score;
  if (patDirSign === sign && patDirSign !== 0) {
    score = clamp(pattern.confidence / 10, 0, 10);
    notes.push(`${pattern.name} identified with ${pattern.confidence}% pattern confidence.`);
  } else if (patDirSign === -sign && patDirSign !== 0) {
    score = clamp(10 - pattern.confidence / 10, 0, 10);
    notes.push(`${pattern.name} points the opposite direction from this thesis, which weakens it.`);
  } else {
    const decisive = lastCandle.dir === sign && lastCandle.bodyRatio > 0.55;
    score = decisive ? 6 : 4;
    notes.push('No high-confidence named pattern on the latest candle.');
  }
  return { score: Math.round(score), notes };
}

function volumeScore(volumeContext, structure, sign) {
  const onBreakout = structure.trendBreak.broke && structure.trendBreak.direction === (sign > 0 ? 'up' : 'down');
  if (!volumeContext || volumeContext === 'unknown') {
    return { score: 5, notes: ['Volume was not provided, so it is treated as neutral / unconfirmed rather than assumed.'], unconfirmed: true };
  }
  if (volumeContext === 'expanding') {
    return {
      score: onBreakout ? 9 : 7,
      notes: [onBreakout ? 'Volume is expanding on the breakout, a real confirmation signal.' : 'Volume is expanding, adding some confirmation.'],
      unconfirmed: false,
    };
  }
  if (volumeContext === 'contracting') {
    return {
      score: onBreakout ? 2 : 4,
      notes: [onBreakout ? 'Volume is contracting into the breakout — a warning sign the move may lack real participation.' : 'Volume is contracting, a mild negative for follow-through.'],
      unconfirmed: false,
    };
  }
  return { score: 5, notes: ['Volume is roughly average — present but not a strong confirming or contradicting signal.'], unconfirmed: false };
}

function rrScore(rr) {
  if (rr == null || !isFinite(rr)) return { score: 3, notes: ['Risk:reward could not be reliably computed from the visible geometry.'] };
  let score;
  if (rr >= 3) score = 10;
  else if (rr >= 2.5) score = 9;
  else if (rr >= 2) score = 8;
  else if (rr >= 1.7) score = 7;
  else if (rr >= 1.4) score = 5;
  else if (rr >= 1.1) score = 3;
  else score = 1;
  return { score, notes: [`Estimated risk:reward is about 1:${rr.toFixed(1)}.`] };
}

function contextScore(candles, eventRisk, sign) {
  const notes = [];
  const ar = candles.slice(-14).reduce((s, c) => s + c.range, 0) / Math.min(14, candles.length);
  const lastRange = candles.at(-1).range;
  let score = 7;
  if (lastRange > ar * 2.2) {
    score = 4;
    notes.push('The latest candle range is unusually large versus the recent average — elevated volatility raises whipsaw risk.');
  } else {
    notes.push('Recent volatility looks in line with the visible range.');
  }
  if (eventRisk && eventRisk.flagged) {
    score = clamp(score - 3, 0, 10);
    notes.push(`Event risk flagged: ${eventRisk.text || 'a known catalyst is nearby'}. This can override a clean technical setup.`);
  }
  return { score: Math.round(score), notes };
}

function mtfScore(mtfEntries, sign) {
  if (!mtfEntries || !mtfEntries.length) return null;
  let agree = 0, total = 0;
  const conflicts = [];
  for (const e of mtfEntries) {
    const w = TF_RANK[e.timeframe] || 1;
    total += w;
    if (e.bias === 'bullish' && sign > 0) agree += w;
    else if (e.bias === 'bearish' && sign < 0) agree += w;
    else if (e.bias === 'mixed') agree += w * 0.5;
    else conflicts.push(e.timeframe);
  }
  const frac = total ? agree / total : 0.5;
  const notes = conflicts.length
    ? [`${conflicts.join(', ')} timeframe(s) disagree with this thesis, which reduces conviction.`]
    : ['Other timeframes analyzed are aligned with this thesis.'];
  return { score: Math.round(clamp(frac * 10, 0, 10)), notes, frac, conflicts };
}

// Main entry point. `levels` and `rr` are produced by scenario.js so the
// R:R the scorer sees is the same R:R shown in the trade plan.
export function scoreSetup({ candles, structure, pattern, levels, sign, rr, volumeContext, mtfEntries, eventRisk }) {
  const last = candles.at(-1);
  const factors = {
    structure: structureScore(structure, sign),
    sr: srScore(levels, last, sign),
    candle: candleScore(pattern, last, sign),
    volume: volumeScore(volumeContext, structure, sign),
    momentum: momentumScore(candles, sign),
    rr: rrScore(rr),
    context: contextScore(candles, eventRisk, sign),
  };
  const hasMtf = !!(mtfEntries && mtfEntries.length);
  if (hasMtf) factors.mtf = mtfScore(mtfEntries, sign);

  const weights = buildWeights(hasMtf);
  let conviction = 0;
  for (const k in weights) {
    if (factors[k]) conviction += (factors[k].score / 10) * weights[k] * 100;
  }
  conviction = Math.round(clamp(conviction, 0, 100));

  const strengths = [], weaknesses = [], neutral = [];
  for (const k in factors) {
    const f = factors[k];
    if (!f) continue;
    const bucket = f.score >= 7 ? strengths : f.score <= 4 ? weaknesses : neutral;
    for (const n of f.notes || []) bucket.push(n);
  }

  return { conviction, factors, weights, strengths, weaknesses, neutral };
}
