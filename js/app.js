import { extractCandles } from './engine/geometry.js';
import { runAnalysis } from './engine/analyze.js';
import { summarizeAlignment } from './engine/mtf.js';
import * as journal from './journal.js';

const TIMEFRAMES = ['5m', '15m', '1h', '4h'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const slots = {};
let focusTf = '1h';

// ---------------------------------------------------------------- tiles ---
function buildTiles() {
  const grid = $('tfGrid');
  const tpl = $('tfTileTemplate');
  TIMEFRAMES.forEach((tf) => {
    const node = tpl.content.cloneNode(true);
    const tile = node.querySelector('.tfTile');
    tile.dataset.tf = tf;
    node.querySelector('.tfTileLabel').textContent = tf;

    const radio = node.querySelector('input[type=radio]');
    radio.value = tf;
    radio.checked = tf === focusTf;
    radio.addEventListener('change', () => { focusTf = tf; });

    const drop = node.querySelector('.drop');
    const fileInput = node.querySelector('.fileInput');
    const pickBtn = node.querySelector('.pick');
    const img = node.querySelector('.preview');
    const emptyDiv = node.querySelector('.empty');
    const status = node.querySelector('.tfStatus');
    const overlay = node.querySelector('.overlay');

    pickBtn.onclick = (e) => { e.stopPropagation(); fileInput.click(); };
    drop.onclick = (e) => { if (!img.src && e.target !== pickBtn) fileInput.click(); };
    ['dragenter', 'dragover'].forEach((k) => drop.addEventListener(k, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((k) => drop.addEventListener(k, () => drop.classList.remove('drag')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(tf, e.dataTransfer.files[0]); });
    fileInput.onchange = () => fileInput.files[0] && loadFile(tf, fileInput.files[0]);

    slots[tf] = { img, fileInput, drop, status, emptyDiv, overlay };
    grid.appendChild(node);
  });
}

function loadFile(tf, file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const slot = slots[tf];
    slot.img.src = reader.result;
    slot.img.hidden = false;
    slot.emptyDiv.hidden = true;
    slot.status.textContent = 'Chart ready';
    slot.overlay.innerHTML = '';
    updateAnalyzeEnabled();
  };
  reader.readAsDataURL(file);
}

function updateAnalyzeEnabled() {
  $('analyzeBtn').disabled = !TIMEFRAMES.some((tf) => slots[tf].img.src);
}

function makeThumbnail(imgEl) {
  try {
    const c = document.createElement('canvas');
    const w = 160, h = Math.max(1, Math.round((160 * imgEl.naturalHeight) / imgEl.naturalWidth));
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(imgEl, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

function drawOverlay(focus, tf, geoH) {
  const slot = slots[tf];
  if (!slot || !slot.img.src || !focus.levels) return;
  const box = slot.drop.getBoundingClientRect();
  const ir = slot.img.getBoundingClientRect();
  const sy = ir.height / geoH;
  const left = ir.left - box.left;
  const top = ir.top - box.top;
  slot.overlay.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const lines = [
    [focus.levels.resistanceY, '#ff7180', 'RESISTANCE'],
    [focus.levels.supportY, '#36d9a8', 'SUPPORT'],
  ];
  slot.overlay.innerHTML = lines.map(([y, c, t]) => `
    <line x1="${left}" x2="${left + ir.width}" y1="${top + y * sy}" y2="${top + y * sy}" stroke="${c}" stroke-width="2" stroke-dasharray="6 4"/>
    <rect x="${left + 6}" y="${Math.max(2, top + y * sy - 18)}" width="78" height="15" rx="7" fill="#071019dd"/>
    <text x="${left + 12}" y="${Math.max(13, top + y * sy - 7)}" fill="${c}" font-size="9" font-weight="800">${t}</text>
  `).join('');
}

function priceOrPixel(levels, y, fallback) {
  return levels.calibrated ? `$${levels.priceAt(y).toFixed(2)}` : fallback;
}

// -------------------------------------------------------------- analyze ---
async function runFullAnalysis() {
  const uploaded = TIMEFRAMES.filter((tf) => slots[tf].img.src);
  if (!uploaded.length) return;
  const effectiveFocus = uploaded.includes(focusTf) ? focusTf : uploaded[0];

  const ticker = $('ticker').value.trim().toUpperCase();
  const volumeContext = $('volumeContext').value;
  const eventRisk = { flagged: $('eventRiskFlag').checked, text: $('eventRiskText').value.trim() };
  const chartHigh = parseFloat($('chartHigh').value);
  const chartLow = parseFloat($('chartLow').value);
  const calibration = (isFinite(chartHigh) && isFinite(chartLow) && chartHigh > chartLow) ? { highPrice: chartHigh, lowPrice: chartLow } : null;
  const accountSize = parseFloat($('accountSize').value);
  const riskPct = parseFloat($('riskPct').value);
  const account = (isFinite(accountSize) && isFinite(riskPct) && accountSize > 0 && riskPct > 0) ? { size: accountSize, riskPct } : null;

  const cv = $('cv');
  const geo = {};
  for (const tf of uploaded) geo[tf] = extractCandles(slots[tf].img, cv);

  const others = uploaded.filter((tf) => tf !== effectiveFocus);
  const otherResults = {};
  for (const tf of others) {
    otherResults[tf] = runAnalysis({ candles: geo[tf].candles, quality: geo[tf].quality, ticker, timeframeLabel: tf, volumeContext, eventRisk });
  }
  const mtfEntries = others
    .map((tf) => {
      const r = otherResults[tf];
      return r && !r.error && r.bias !== 'mixed' ? { timeframe: tf, bias: r.bias, conviction: r.conviction } : null;
    })
    .filter(Boolean);

  const focusGeo = geo[effectiveFocus];
  const focus = runAnalysis({
    candles: focusGeo.candles, quality: focusGeo.quality, ticker, timeframeLabel: effectiveFocus,
    calibration, volumeContext, eventRisk, mtfEntries, account,
  });

  const alignment = (!focus.error && focus.sign) ? summarizeAlignment(mtfEntries, focus.sign, effectiveFocus) : null;

  renderResult(focus, {
    mtfEntries, alignment, focusTf: effectiveFocus, otherResults, ticker, volumeContext, eventRisk,
    geoH: focusGeo.h,
  });
}

function factorLabel(k) {
  return { structure: 'Structure', sr: 'S/R', candle: 'Candle', volume: 'Volume', momentum: 'Momentum', rr: 'R:R', context: 'Context', mtf: 'Timeframe' }[k] || k;
}

function renderResult(focus, meta) {
  const resultEl = $('result');

  if (focus.error) {
    resultEl.innerHTML = `
      <div class="decision wait">
        <div class="decisionEyebrow">CANDLE OUTLOOK</div>
        <h2>WAIT</h2>
        <div class="direction">Chart not readable enough</div>
      </div>
      <div class="section"><h3>Why?</h3><p>${esc(focus.reasonsText)}</p></div>`;
    return;
  }

  const cls = focus.decision.toLowerCase();
  const ring = focus.decision === 'BUY' ? '#36d9a8' : focus.decision === 'SELL' ? '#ff7180' : '#f5c65d';
  const directionLabel = focus.bias === 'bullish' ? 'Bullish' : focus.bias === 'bearish' ? 'Bearish' : 'Mixed';
  const name = meta.ticker || 'Uploaded chart';

  // No directional thesis at all: pattern, structure and momentum disagree.
  // There is no support/resistance-derived plan or scenario to show.
  if (!focus.plan || !focus.levels || !focus.scenario) {
    resultEl.innerHTML = `
      <div class="decision ${cls}">
        <div class="decisionTop">
          <div>
            <div class="decisionEyebrow">CANDLE OUTLOOK · ${esc(name)} · ${esc(meta.focusTf)}</div>
            <h2>${focus.decision}</h2>
            <div class="direction">${directionLabel} — no directional thesis</div>
          </div>
        </div>
      </div>
      <div class="noTradeBanner"><b>No-trade conditions flagged</b>${(focus.noTrade.reasons || []).map((r) => `• ${esc(r)}`).join('<br>')}</div>
      <div class="section">
        <h3>Market structure</h3>
        <p>${esc(focus.structure.label)}</p>
      </div>
      <div class="section">
        <h3>Latest candle read</h3>
        <p>${esc(focus.pattern.name)} · ${focus.pattern.confidence}% pattern confidence — this pattern alone does not outweigh a conflicting structure/momentum read.</p>
      </div>
      <div class="actionsRow">
        <button class="btn primary" id="saveJournalBtn">Save to journal</button>
      </div>`;
    $('saveJournalBtn').onclick = () => {
      const thumb = makeThumbnail(slots[meta.focusTf].img);
      journal.addEntry(focus, { ticker: meta.ticker, timeframeLabel: meta.focusTf, volumeContext: meta.volumeContext, eventRisk: meta.eventRisk, thumbnail: thumb });
      const btn = $('saveJournalBtn');
      if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; }
    };
    return;
  }

  const factorRows = Object.entries(focus.scorecard.factors).filter(([, v]) => v).map(([k, v]) => {
    const pct = v.score * 10;
    const barColor = v.score >= 7 ? 'var(--buy)' : v.score <= 4 ? 'var(--sell)' : 'var(--wait)';
    return `<div class="scoreRow"><span>${factorLabel(k)}</span><div class="scoreBar"><div style="width:${pct}%;background:${barColor}"></div></div><div class="scoreVal">${v.score}/10</div></div>`;
  }).join('');

  const strengthsHtml = focus.scorecard.strengths.length
    ? focus.scorecard.strengths.map((s) => `<div class="evItem"><span class="dotGood"></span>${esc(s)}</div>`).join('')
    : '<div class="evItem muted">No standout strengths identified.</div>';
  const weaknessesHtml = focus.scorecard.weaknesses.length
    ? focus.scorecard.weaknesses.map((s) => `<div class="evItem"><span class="dotBad"></span>${esc(s)}</div>`).join('')
    : '<div class="evItem muted">No major weaknesses identified.</div>';

  const noTradeHtml = focus.noTrade && focus.noTrade.flagged
    ? `<div class="noTradeBanner"><b>No-trade conditions flagged</b>${focus.noTrade.reasons.map((r) => `• ${esc(r)}`).join('<br>')}</div>`
    : '';
  const eventHtml = meta.eventRisk && meta.eventRisk.flagged
    ? `<div class="eventBanner"><b>Event risk:</b> ${esc(meta.eventRisk.text || 'A known catalyst is nearby.')} This can override an otherwise clean technical setup.</div>`
    : '';

  const mtfChips = (meta.mtfEntries || []).map((e) => {
    const agree = (e.bias === 'bullish' && focus.sign > 0) || (e.bias === 'bearish' && focus.sign < 0);
    return `<span class="mtfChip ${agree ? 'agree' : 'conflict'}">${esc(e.timeframe)} · ${esc(e.bias)}</span>`;
  }).join('');
  const focusChip = `<span class="mtfChip agree">${esc(meta.focusTf)} · focus</span>`;

  const scenario = focus.scenario;
  const plan = focus.plan;
  const levels = focus.levels;
  const rrText = plan.rr != null ? `1:${plan.rr.toFixed(1)}` : 'n/a';

  const ind = focus.indicators;
  const indText = {
    rsi: ind && ind.rsi != null ? ind.rsi.toFixed(0) : 'n/a (needs more candles)',
    ema: ind && ind.emaFast != null && ind.emaSlow != null
      ? (ind.emaFast < ind.emaSlow ? 'EMA9 above EMA21 (short-term bullish stack)' : 'EMA9 below EMA21 (short-term bearish stack)')
      : 'EMA9/21 n/a (needs more candles)',
    divergenceHtml: ind && ind.divergences && ind.divergences.length
      ? ind.divergences.map((d) => `<div class="evItem"><span class="dotGood"></span>${esc(d.label)}.</div>`).join('')
      : '',
  };

  const planRows = [
    ['Bias', focus.bias === 'bullish' ? 'Bullish' : 'Bearish'],
    ['Confirmation', priceOrPixel(levels, plan.confirmationY, focus.sign > 0 ? 'Close above resistance' : 'Close below support')],
    ['Invalidation', priceOrPixel(levels, plan.invalidationY, focus.sign > 0 ? 'Close below support' : 'Close above resistance')],
    ['Stop concept', priceOrPixel(levels, plan.stopY, 'Beyond invalidation + buffer')],
    ['Target 1 (~1x range)', priceOrPixel(levels, plan.t1Y, 'Measured move (1x range)')],
    ['Target 2 (~2x range)', priceOrPixel(levels, plan.t2Y, 'Measured move (2x range)')],
    ['Estimated R:R', rrText],
    ['Setup quality', `${focus.conviction}/100`],
  ].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('');

  const sizing = focus.sizing;
  const sizingHtml = sizing
    ? `<div class="sizingBox"><b>Position size:</b> risking $${sizing.riskDollars.toFixed(2)} with a stop near $${sizing.stopPrice.toFixed(2)} and entry near $${sizing.entryPrice.toFixed(2)} ≈ <b>${sizing.shares} shares/units</b>.</div>`
    : '<div class="sizingBox muted">Add the highest/lowest visible price plus account size and risk % on the left to see a position-size calculation.</div>';

  resultEl.innerHTML = `
    <div class="decision ${cls}">
      <div class="decisionTop">
        <div>
          <div class="decisionEyebrow">CANDLE OUTLOOK · ${esc(name)} · ${esc(meta.focusTf)}</div>
          <h2>${focus.decision}</h2>
          <div class="direction">${directionLabel} lean</div>
        </div>
        <div class="confidenceRing" style="--pct:${focus.conviction};--ring:${ring}"><div><strong>${focus.conviction}</strong><small>conviction /100</small></div></div>
      </div>
    </div>
    ${noTradeHtml}${eventHtml}

    <div class="confRow">
      <div class="confCard"><span>PATTERN CONFIDENCE</span><b>${esc(focus.pattern.name)} · ${focus.pattern.confidence}%</b></div>
      <div class="confCard"><span>TRADE CONVICTION</span><b>${focus.conviction}/100</b></div>
    </div>

    <div class="section">
      <h3>Setup quality scorecard</h3>
      ${factorRows}
    </div>

    <div class="section">
      <h3>Market structure</h3>
      <p>${esc(focus.structure.label)}${focus.structure.trendBreak.broke ? ` — ${esc(focus.structure.trendBreak.label)}.` : ''}</p>
      ${focus.structure.events.length ? `<div style="margin-top:8px">${focus.structure.events.map((e) => `<div class="evItem"><span class="dotGood"></span>${esc(e.label)}</div>`).join('')}</div>` : ''}
    </div>

    <div class="section">
      <h3>Momentum &amp; indicators</h3>
      <p>RSI(14): <b>${indText.rsi}</b> · ${esc(indText.ema)}</p>
      ${indText.divergenceHtml}
    </div>

    <div class="section">
      <h3>What strengthens the setup</h3>
      <div class="evList">${strengthsHtml}</div>
    </div>
    <div class="section">
      <h3>What weakens it</h3>
      <div class="evList">${weaknessesHtml}</div>
    </div>

    <div class="section">
      <h3>Multi-timeframe</h3>
      <p>${esc(meta.alignment ? meta.alignment.text : 'Only one timeframe was analyzed — add more for confirmation.')}</p>
      <div class="mtfChips">${focusChip}${mtfChips}</div>
    </div>

    <div class="section">
      <h3>Scenario</h3>
      <div class="scenarioGrid">
        <div class="scenario confirm"><span>PRIMARY SCENARIO</span>${esc(scenario.primary)}</div>
        <div class="scenario invalidate"><span>ALTERNATIVE SCENARIO</span>${esc(scenario.alternative)}</div>
      </div>
    </div>

    <div class="section">
      <h3>Trade plan</h3>
      <table class="planTable"><tbody>${planRows}</tbody></table>
      ${sizingHtml}
    </div>

    <div class="section">
      <h3>Limits</h3>
      <p>This is a chart-derived technical read, not personalized investment advice. ${levels.calibrated ? '' : 'Dollar levels are qualitative here — add the visible high/low on the left for calculated price targets. '}${meta.volumeContext === 'unknown' ? 'Volume was not provided and is treated as neutral. ' : ''}Events outside the screenshot can invalidate this setup.</p>
    </div>

    <div class="actionsRow">
      <button class="btn primary" id="saveJournalBtn">Save to journal</button>
    </div>
  `;

  $('saveJournalBtn').onclick = () => {
    const thumb = makeThumbnail(slots[meta.focusTf].img);
    journal.addEntry(focus, { ticker: meta.ticker, timeframeLabel: meta.focusTf, volumeContext: meta.volumeContext, eventRisk: meta.eventRisk, thumbnail: thumb });
    const btn = $('saveJournalBtn');
    if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; }
  };

  drawOverlay(focus, meta.focusTf, meta.geoH);
}

// --------------------------------------------------------------- journal --
function renderJournal() {
  const entries = journal.loadJournal();
  const stats = journal.computeStats();

  $('journalStats').innerHTML = `
    <div class="sectionLabel">EVIDENCE FROM YOUR RECORDED SETUPS</div>
    ${stats.rows.length
      ? stats.rows.map((r) => `<div class="journalRow"><span>${esc(r.key)}</span><b>${r.successRate}% target-hit ${r.lowConfidence ? `(small sample, n=${r.sampleSize})` : `(n=${r.sampleSize})`}</b></div>`).join('')
      : '<p class="muted small">Record outcomes on saved setups below to build evidence-based stats here — purely from your own recorded samples.</p>'}
  `;

  const list = $('journalList');
  if (!entries.length) {
    list.innerHTML = '<p class="muted small">No saved setups yet. Run an analysis and click "Save to journal".</p>';
    return;
  }

  list.innerHTML = entries.map((e) => {
    const cls = e.decision.toLowerCase();
    const followUpHtml = e.followUp
      ? `<div class="small muted" style="margin-top:8px">${e.followUp.notes.map((n) => esc(n)).join('<br>')}</div>`
      : '';
    return `<div class="journalCard" data-id="${e.id}">
      <div class="journalCardTop">
        <div style="display:flex;gap:10px;align-items:center">
          ${e.thumbnail ? `<img class="thumb" src="${e.thumbnail}" alt="">` : ''}
          <div>
            <div class="journalTicker">${esc(e.ticker)} <span class="badge ${cls}">${e.decision}</span></div>
            <div class="journalMeta">${esc(e.timeframeLabel)} · ${new Date(e.savedAt).toLocaleString()} · conviction ${e.conviction}/100</div>
          </div>
        </div>
        <label class="checkRow"><input type="checkbox" class="compareCheck" value="${e.id}"> Compare</label>
      </div>
      <div class="journalRow"><span>${esc(e.patternName || '—')} · ${esc(e.structureLabel || '—')}</span><span>R:R ${e.rr != null ? `1:${e.rr}` : 'n/a'}</span></div>
      <div class="journalActions">
        <select class="outcomeSelect">
          ${journal.OUTCOMES.map((o) => `<option value="${o.id}" ${o.id === e.outcome ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <button class="btn tiny secondary followUpBtn" type="button">Upload follow-up chart</button>
        <input type="file" accept="image/*" class="followUpFile hidden">
        <button class="btn tiny secondary deleteBtn" type="button">Delete</button>
      </div>
      ${followUpHtml}
    </div>`;
  }).join('');

  list.querySelectorAll('.outcomeSelect').forEach((sel) => {
    sel.onchange = () => {
      const id = sel.closest('.journalCard').dataset.id;
      journal.updateOutcome(id, sel.value, '');
      renderJournal();
    };
  });
  list.querySelectorAll('.deleteBtn').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.closest('.journalCard').dataset.id;
      journal.deleteEntry(id);
      renderJournal();
    };
  });
  list.querySelectorAll('.followUpBtn').forEach((btn) => {
    btn.onclick = () => btn.closest('.journalCard').querySelector('.followUpFile').click();
  });
  list.querySelectorAll('.followUpFile').forEach((input) => {
    input.onchange = () => handleFollowUpUpload(input);
  });
}

function handleFollowUpUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const card = input.closest('.journalCard');
  const id = card.dataset.id;
  const reader = new FileReader();
  reader.onload = () => {
    const tmpImg = new Image();
    tmpImg.onload = () => {
      const { candles, quality } = extractCandles(tmpImg, $('cv'));
      const entries = journal.loadJournal();
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      let calibration = null;
      const highStr = window.prompt('Highest visible price on this follow-up chart (Cancel to skip $ calibration):', '');
      if (highStr !== null && highStr.trim() !== '') {
        const lowStr = window.prompt('Lowest visible price on this follow-up chart:', '');
        const hi = parseFloat(highStr), lo = parseFloat(lowStr);
        if (isFinite(hi) && isFinite(lo) && hi > lo) calibration = { highPrice: hi, lowPrice: lo };
      }

      const followResult = runAnalysis({
        candles, quality, ticker: entry.ticker, timeframeLabel: `${entry.timeframeLabel} (follow-up)`,
        calibration, volumeContext: entry.volumeContext,
      });
      const evalRes = journal.evaluatePostTrade(entry, followResult);
      journal.recordFollowUp(id, evalRes);
      if (evalRes.suggestedOutcome) {
        journal.updateOutcome(id, evalRes.suggestedOutcome, 'Auto-suggested from follow-up chart.');
      }
      renderJournal();
    };
    tmpImg.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderCompare(entries) {
  const rows = journal.buildComparisonRows(entries);
  const head = ['Ticker', 'TF', 'Decision', 'Conviction', 'Structure', 'Pattern', 'R:R', 'Event risk', 'Key weakness'];
  const body = rows.map((r) => `<tr>
    <td>${esc(r.ticker)}</td><td>${esc(r.timeframeLabel)}</td>
    <td><span class="badge ${r.decision.toLowerCase()}">${r.decision}</span></td>
    <td>${r.conviction}/100</td><td>${esc(r.structureLabel || '—')}</td><td>${esc(r.patternName || '—')}</td>
    <td>${r.rr != null ? `1:${r.rr}` : 'n/a'}</td><td>${r.eventRiskFlagged ? '⚠ flagged' : '—'}</td>
    <td>${esc((r.weaknesses && r.weaknesses[0]) || '—')}</td>
  </tr>`).join('');
  $('compareTable').innerHTML = rows.length
    ? `<table class="compareTable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
    : '<p class="muted small">Select saved setups in the Journal tab and press "Compare selected".</p>';
}

// ------------------------------------------------------------------ tabs --
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('panelAnalyze').classList.toggle('hidden', name !== 'analyze');
  $('panelJournal').classList.toggle('hidden', name !== 'journal');
  $('panelCompare').classList.toggle('hidden', name !== 'compare');
  if (name === 'journal') renderJournal();
}

// ------------------------------------------------------------------ init --
function init() {
  buildTiles();
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });
  $('analyzeBtn').onclick = () => runFullAnalysis();
  $('resetBtn').onclick = () => location.reload();
  $('clearJournalBtn').onclick = () => {
    if (window.confirm('Clear the entire journal? This cannot be undone.')) { journal.clearJournal(); renderJournal(); }
  };
  $('exportJournalBtn').onclick = () => {
    const json = journal.exportJournal();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candle-outlook-journal-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  $('importJournalBtn').onclick = () => $('importJournalFile').click();
  $('importJournalFile').onchange = () => {
    const file = $('importJournalFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = journal.importJournal(String(reader.result), 'merge');
      const status = $('importStatus');
      status.textContent = result.ok
        ? `Imported ${result.added} new setup(s), skipped ${result.skipped} already in your journal.`
        : `Import failed: ${result.error}`;
      if (result.ok) renderJournal();
    };
    reader.readAsText(file);
    $('importJournalFile').value = '';
  };
  $('compareSelectedBtn').onclick = () => {
    const ids = Array.from(document.querySelectorAll('.compareCheck:checked')).map((el) => el.value);
    const entries = journal.loadJournal().filter((e) => ids.includes(e.id));
    if (!entries.length) { window.alert('Select at least one saved setup to compare.'); return; }
    renderCompare(entries);
    switchTab('compare');
  };
  window.addEventListener('resize', () => TIMEFRAMES.forEach((tf) => { if (slots[tf]) slots[tf].overlay.innerHTML = ''; }));
}

document.addEventListener('DOMContentLoaded', init);
