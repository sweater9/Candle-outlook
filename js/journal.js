// localStorage-backed trading journal: snapshot storage, manual outcome
// recording, evidence-driven follow-through stats computed only from the
// user's own recorded samples, setup comparison, and post-trade analysis.

const STORAGE_KEY = 'candleOutlookJournal_v3';

export const OUTCOMES = [
  { id: 'still-open', label: 'Still open' },
  { id: 'target-hit', label: 'Target hit' },
  { id: 'invalidated', label: 'Invalidated' },
  { id: 'sideways', label: 'Sideways / no follow-through' },
  { id: 'false-breakout', label: 'False breakout' },
];

function uid() {
  return `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJournal(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (private mode / quota) — journal simply
    // won't persist across reloads; the rest of the app still works.
  }
}

// Builds a durable snapshot from a full runAnalysis() result. Only fields
// needed for later comparison/stats/post-trade review are kept; the full
// candle geometry is dropped to keep entries small.
export function buildSnapshot(result, meta = {}) {
  if (!result || result.error) return null;
  const levels = result.levels || {};
  const plan = result.plan || {};
  return {
    id: uid(),
    savedAt: new Date().toISOString(),
    ticker: meta.ticker || result.ticker || 'Unlabeled chart',
    timeframeLabel: meta.timeframeLabel || result.timeframeLabel || 'Unknown',
    decision: result.decision,
    bias: result.bias,
    sign: result.sign || null,
    conviction: result.conviction,
    patternName: result.pattern ? result.pattern.name : null,
    patternConfidence: result.pattern ? result.pattern.confidence : null,
    structureLabel: result.structure ? result.structure.label : null,
    volumeContext: meta.volumeContext || 'unknown',
    strengths: result.scorecard ? result.scorecard.strengths.slice(0, 6) : [],
    weaknesses: result.scorecard ? result.scorecard.weaknesses.slice(0, 6) : [],
    scenario: result.scenario || null,
    calibrated: !!levels.calibrated,
    levelsPrice: levels.calibrated ? { resistance: levels.resistancePrice, support: levels.supportPrice } : null,
    planPrice: levels.calibrated && plan.t1Y != null ? {
      confirmation: levels.priceAt(plan.confirmationY),
      invalidation: levels.priceAt(plan.invalidationY),
      target1: levels.priceAt(plan.t1Y),
      target2: levels.priceAt(plan.t2Y),
    } : null,
    rr: plan.rr != null ? Number(plan.rr.toFixed(2)) : null,
    eventRiskFlagged: !!(meta.eventRisk && meta.eventRisk.flagged),
    thumbnail: meta.thumbnail || null,
    outcome: 'still-open',
    outcomeNote: '',
    outcomeSetAt: null,
    followUp: null,
  };
}

export function addEntry(result, meta) {
  const snapshot = buildSnapshot(result, meta);
  if (!snapshot) return null;
  const entries = loadJournal();
  entries.unshift(snapshot);
  saveJournal(entries);
  return snapshot;
}

export function updateOutcome(id, outcome, note) {
  const entries = loadJournal();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.outcome = outcome;
  entry.outcomeNote = note || '';
  entry.outcomeSetAt = new Date().toISOString();
  saveJournal(entries);
  return entry;
}

export function recordFollowUp(id, followUpSummary) {
  const entries = loadJournal();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.followUp = { ...followUpSummary, analyzedAt: new Date().toISOString() };
  saveJournal(entries);
  return entry;
}

export function deleteEntry(id) {
  const entries = loadJournal().filter((e) => e.id !== id);
  saveJournal(entries);
  return entries;
}

export function clearJournal() {
  saveJournal([]);
}

// The journal is localStorage-only, so a browser data clear or switching
// devices wipes it silently. Export/import gives it a portable backup.
export function exportJournal() {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: loadJournal() }, null, 2);
}

// Accepts either the {version, entries} envelope from exportJournal() or a
// bare array (in case someone hand-edits/concatenates files). Existing
// entries are matched by id; 'merge' keeps the existing copy on a
// collision (so a re-import never clobbers newer local edits), 'replace'
// discards the current journal entirely and adopts the imported one.
export function importJournal(jsonText, mode = 'merge') {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : null;
  if (!incoming) return { ok: false, error: 'That file does not look like a Candle Outlook journal export.' };

  if (mode === 'replace') {
    saveJournal(incoming);
    return { ok: true, added: incoming.length, skipped: 0, total: incoming.length };
  }

  const existing = loadJournal();
  const existingIds = new Set(existing.map((e) => e.id));
  let added = 0, skipped = 0;
  for (const entry of incoming) {
    if (!entry || !entry.id || existingIds.has(entry.id)) { skipped++; continue; }
    existing.push(entry);
    existingIds.add(entry.id);
    added++;
  }
  existing.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  saveJournal(existing);
  return { ok: true, added, skipped, total: existing.length };
}

// Groups closed (non-"still-open") entries by pattern + decision + volume
// context and reports the observed follow-through rate. This is strictly
// derived from the user's own recorded outcomes — never fabricated, and
// small samples are labeled as such rather than presented with false
// precision.
export function computeStats() {
  const entries = loadJournal().filter((e) => e.outcome && e.outcome !== 'still-open');
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.patternName || 'Unnamed pattern'} · ${e.decision} · volume ${e.volumeContext || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const success = list.filter((e) => e.outcome === 'target-hit').length;
    rows.push({
      key,
      sampleSize: list.length,
      successRate: Math.round((success / list.length) * 100),
      lowConfidence: list.length < 5,
    });
  }
  rows.sort((a, b) => b.sampleSize - a.sampleSize);
  return { totalClosed: entries.length, rows };
}

// Post-trade analysis: compares the original saved thesis against a fresh
// analysis of a later chart. Where both charts were price-calibrated it
// checks the follow-up price against the original target/invalidation
// levels; otherwise it reports what it can (bias/structure/momentum
// changes) and leaves the outcome for the user to confirm manually.
export function evaluatePostTrade(entry, followUpResult) {
  const notes = [];
  let suggestedOutcome = null;

  if (entry.planPrice && followUpResult && !followUpResult.error && followUpResult.levels && followUpResult.levels.calibrated) {
    const lastPrice = followUpResult.levels.priceAt(followUpResult.candles.at(-1).mid);
    const { target1, invalidation } = entry.planPrice;
    if (entry.sign > 0) {
      if (lastPrice >= target1) { suggestedOutcome = 'target-hit'; notes.push(`Follow-up price ${lastPrice.toFixed(2)} reached or exceeded target 1 (${target1.toFixed(2)}).`); }
      else if (lastPrice <= invalidation) { suggestedOutcome = 'invalidated'; notes.push(`Follow-up price ${lastPrice.toFixed(2)} broke below the invalidation level (${invalidation.toFixed(2)}).`); }
      else notes.push(`Follow-up price ${lastPrice.toFixed(2)} is still between invalidation (${invalidation.toFixed(2)}) and target 1 (${target1.toFixed(2)}) — the setup remains open.`);
    } else {
      if (lastPrice <= target1) { suggestedOutcome = 'target-hit'; notes.push(`Follow-up price ${lastPrice.toFixed(2)} reached or fell below target 1 (${target1.toFixed(2)}).`); }
      else if (lastPrice >= invalidation) { suggestedOutcome = 'invalidated'; notes.push(`Follow-up price ${lastPrice.toFixed(2)} broke above the invalidation level (${invalidation.toFixed(2)}).`); }
      else notes.push(`Follow-up price ${lastPrice.toFixed(2)} is still between target 1 (${target1.toFixed(2)}) and invalidation (${invalidation.toFixed(2)}) — the setup remains open.`);
    }
  } else {
    notes.push('Neither chart had a price calibration in common, so the outcome could not be inferred automatically — record it manually below.');
  }

  if (followUpResult && !followUpResult.error && followUpResult.bias && followUpResult.bias !== entry.bias) {
    notes.push(`The follow-up chart's own independent read is now ${followUpResult.bias} versus the original ${entry.bias} thesis.`);
  }

  const signalNotes = [];
  if (followUpResult && !followUpResult.error && followUpResult.scorecard) {
    signalNotes.push(`Follow-up conviction: ${followUpResult.conviction}/100 (was ${entry.conviction}/100 originally).`);
  }

  return { suggestedOutcome, notes: [...notes, ...signalNotes] };
}

// Flat rows for the setup-comparison table.
export function buildComparisonRows(entries) {
  return entries.map((e) => ({
    id: e.id,
    ticker: e.ticker,
    timeframeLabel: e.timeframeLabel,
    decision: e.decision,
    conviction: e.conviction,
    structureLabel: e.structureLabel,
    patternName: e.patternName,
    rr: e.rr,
    eventRiskFlagged: e.eventRiskFlagged,
    weaknesses: e.weaknesses,
    outcome: e.outcome,
  }));
}
