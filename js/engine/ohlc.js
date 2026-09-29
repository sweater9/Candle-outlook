// Convert real OHLC series (from the live terminal / candle proxy) into the
// pixel-space candle geometry the structure/patterns/scoring engines expect.
// Y grows downward: higher prices map to smaller Y, matching screenshot space.

export const LIVE_CANDLES_KEY = 'co-live-candles';

/**
 * @param {Array<{open:number,high:number,low:number,close:number,volume?:number,time?:string}>} rows
 * @param {{ height?: number }} [opts]
 * @returns {{ candles: object[], quality: number, h: number, w: number, highPrice: number, lowPrice: number }}
 */
export function ohlcToGeometry(rows, opts = {}) {
  const data = (rows || []).filter((r) =>
    r && [r.open, r.high, r.low, r.close].every((v) => Number.isFinite(Number(v)))
  );
  if (!data.length) {
    return { candles: [], quality: 0, h: 0, w: 0, highPrice: NaN, lowPrice: NaN };
  }

  const highs = data.map((d) => Number(d.high));
  const lows = data.map((d) => Number(d.low));
  const highPrice = Math.max(...highs);
  const lowPrice = Math.min(...lows);
  const span = Math.max(1e-9, highPrice - lowPrice);
  const H = opts.height || 1000;
  const pad = H * 0.04;
  const usable = H - pad * 2;
  const priceToY = (p) => pad + ((highPrice - Number(p)) / span) * usable;

  const candles = data.map((c, i) => {
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const top = priceToY(high);
    const bottom = priceToY(low);
    const bodyTop = priceToY(Math.max(open, close));
    const bodyBottom = priceToY(Math.min(open, close));
    const range = Math.max(1, bottom - top);
    const bodyRatio = Math.min(1, Math.abs(bodyBottom - bodyTop) / range);
    const dir = close >= open ? 1 : -1;
    const x = 20 + i * 12;
    return {
      x,
      x1: x - 4,
      x2: x + 4,
      top,
      bottom,
      mid: (top + bottom) / 2,
      range,
      dir,
      bodyRatio,
      wickRatio: 1 - bodyRatio,
      bodyTop,
      bodyBottom,
      estOpen: priceToY(open),
      estClose: priceToY(close),
      open,
      high,
      low,
      close,
      volume: Number(c.volume) || 0,
      time: c.time || null,
    };
  });

  // Live/delayed OHLC is authoritative — treat as max quality.
  const quality = Math.min(100, 70 + Math.min(30, candles.length));
  return {
    candles,
    quality,
    h: H,
    w: 20 + candles.length * 12 + 20,
    highPrice,
    lowPrice,
  };
}

export function readLiveCandles(storage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null)) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LIVE_CANDLES_KEY) || (typeof localStorage !== 'undefined' ? localStorage.getItem(LIVE_CANDLES_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.candles) || parsed.candles.length < 7) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLiveCandles() {
  try { sessionStorage.removeItem(LIVE_CANDLES_KEY); } catch {}
  try { localStorage.removeItem(LIVE_CANDLES_KEY); } catch {}
}
