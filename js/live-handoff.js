// Live terminal OHLC → Candle Outlook analysis handoff
import { ohlcToGeometry, readLiveCandles } from './engine/ohlc.js';
import { runAnalysis } from './engine/analyze.js';

export function bootLiveHandoff(deps) {
  const { $, TIMEFRAMES, slots, focusTfRef, setFocusTf, renderResult, esc } = deps;

  function showLiveBanner(payload) {
    const panel = document.querySelector('.uploadPanel');
    if (!panel || panel.querySelector('.liveBanner')) return;
    const n = (payload.candles || []).length;
    const banner = document.createElement('div');
    banner.className = 'liveBanner';
    banner.innerHTML = `<b>Live terminal candles loaded</b> · ${esc(payload.symbol || '—')} · ${esc(payload.interval || '')} · ${esc(payload.provider || '')} · ${n} bars. Screenshot upload is optional — analysis will run on this OHLC series.`;
    panel.insertBefore(banner, panel.firstChild.nextSibling);
  }

  function runLiveOhlcAnalysis(payload) {
    const ticker = (payload.symbol || $('ticker').value || '').trim().toUpperCase();
    if (ticker) $('ticker').value = ticker;
    let timeframeLabel = payload.interval || focusTfRef() || '1h';
    if (TIMEFRAMES.includes(timeframeLabel)) {
      setFocusTf(timeframeLabel);
      document.querySelectorAll('.tfTile input[type=radio]').forEach((r) => {
        if (r.value === timeframeLabel) r.checked = true;
      });
    }
    const volumeContext = $('volumeContext').value;
    const eventRisk = { flagged: $('eventRiskFlag').checked, text: $('eventRiskText').value.trim() };
    const accountSize = parseFloat($('accountSize').value);
    const riskPct = parseFloat($('riskPct').value);
    const account = (isFinite(accountSize) && isFinite(riskPct) && accountSize > 0 && riskPct > 0) ? { size: accountSize, riskPct } : null;
    const geo = ohlcToGeometry(payload.candles);
    const calibration = (isFinite(geo.highPrice) && isFinite(geo.lowPrice) && geo.highPrice > geo.lowPrice)
      ? { highPrice: geo.highPrice, lowPrice: geo.lowPrice } : null;
    if (calibration) {
      $('chartHigh').value = String(calibration.highPrice);
      $('chartLow').value = String(calibration.lowPrice);
    }
    let volCtx = volumeContext;
    if (volCtx === 'unknown' && geo.candles.length >= 20) {
      const vols = geo.candles.map((c) => c.volume || 0);
      const recent = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const prior = vols.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
      if (prior > 0) {
        const ratio = recent / prior;
        if (ratio > 1.25) volCtx = 'expanding';
        else if (ratio < 0.8) volCtx = 'contracting';
        else volCtx = 'average';
        $('volumeContext').value = volCtx;
      }
    }
    const focus = runAnalysis({
      candles: geo.candles, quality: Math.max(geo.quality, 95), ticker, timeframeLabel,
      calibration, volumeContext: volCtx, eventRisk, mtfEntries: [], account,
    });
    $('analyzeBtn').disabled = false;
    renderResult(focus, {
      mtfEntries: [], alignment: null, focusTf: timeframeLabel, otherResults: {},
      ticker, volumeContext: volCtx, eventRisk, geoH: geo.h,
    });
  }

  function tryConsumeLiveCandles() {
    const params = new URLSearchParams(location.search);
    const wantLive = params.get('live') === '1' || params.has('live');
    const payload = readLiveCandles();
    if (!payload) return false;
    showLiveBanner(payload);
    if (wantLive || !TIMEFRAMES.some((tf) => slots[tf] && slots[tf].img && slots[tf].img.src)) {
      runLiveOhlcAnalysis(payload);
    }
    if (wantLive) {
      try {
        const url = new URL(location.href);
        url.searchParams.delete('live');
        history.replaceState({}, '', url.pathname + url.search + url.hash);
      } catch {}
    }
    return true;
  }

  return { tryConsumeLiveCandles, runLiveOhlcAnalysis };
}
