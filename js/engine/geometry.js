// Pixel-space candle extraction. No OHLC prices are fabricated: every
// number produced here is derived directly from pixel geometry in the
// uploaded screenshot, in pixel units, unless the caller supplies a
// price calibration (see calibrate.js-style helpers in scenario.js).

function classifyPixel(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx - mn;
  if (g > r * 1.08 && g > b * 1.03 && s > 28) return 1; // bullish (green-ish)
  if (r > g * 1.08 && r > b * 1.02 && s > 28) return -1; // bearish (red-ish)
  return 0;
}

// Scans an <img> through an offscreen <canvas>, groups colored columns
// into candle bodies/wicks, and returns pixel-space candle geometry plus
// a 0-100 read-quality score for how reliable that geometry is.
export function extractCandles(img, canvas, opts = {}) {
  const maxWidth = opts.maxWidth || 1200;
  const sc = Math.min(1, maxWidth / img.naturalWidth);
  const w = Math.round(img.naturalWidth * sc);
  const h = Math.round(img.naturalHeight * sc);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const x0 = (w * 0.04) | 0, x1 = (w * 0.94) | 0;
  const y0 = (h * 0.04) | 0, y1 = (h * 0.90) | 0;

  const cols = [];
  for (let x = x0; x < x1; x++) {
    const ys = [];
    let bu = 0, be = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * 4;
      const k = classifyPixel(data[i], data[i + 1], data[i + 2]);
      if (k) { ys.push(y); k > 0 ? bu++ : be++; }
    }
    if (ys.length > 2) {
      cols.push({ x, top: Math.min(...ys), bottom: Math.max(...ys), bu, be, count: ys.length });
    }
  }

  // Group adjacent colored columns into individual candles.
  const groups = [];
  for (const q of cols) {
    const g = groups.at(-1);
    if (!g || q.x > g.x2 + 2) {
      groups.push({ x1: q.x, x2: q.x, top: q.top, bottom: q.bottom, bu: q.bu, be: q.be, counts: [q.count] });
    } else {
      g.x2 = q.x;
      g.top = Math.min(g.top, q.top);
      g.bottom = Math.max(g.bottom, q.bottom);
      g.bu += q.bu;
      g.be += q.be;
      g.counts.push(q.count);
    }
  }

  const candles = groups
    .filter((g) => g.x2 - g.x1 >= 1 && g.bottom - g.top >= 5)
    .map((g) => {
      const range = g.bottom - g.top;
      const sorted = [...g.counts].sort((a, b) => a - b);
      const bodyPx = Math.max(1, sorted[Math.floor(sorted.length * 0.7)] || range * 0.45);
      const bodyRatio = Math.min(1, bodyPx / range);
      const wickRatio = 1 - bodyRatio;
      const dir = g.bu >= g.be ? 1 : -1;
      // Body is not necessarily centered, but without per-row open/close
      // color continuity this is the best deterministic estimate: the
      // colored body occupies bodyRatio of the wick-to-wick range.
      const half = (range * bodyRatio) / 2;
      const mid = (g.top + g.bottom) / 2;
      const bodyTop = mid - half;
      const bodyBottom = mid + half;
      // For a bullish candle price closed higher than it opened, so the
      // close sits at the top of the body (smaller pixel y); for bearish
      // the close sits at the bottom of the body.
      const estClose = dir > 0 ? bodyTop : bodyBottom;
      const estOpen = dir > 0 ? bodyBottom : bodyTop;
      return {
        x: (g.x1 + g.x2) / 2,
        x1: g.x1, x2: g.x2,
        top: g.top, bottom: g.bottom,
        mid, range, dir, bodyRatio, wickRatio,
        bodyTop, bodyBottom, estOpen, estClose,
      };
    })
    .slice(-120);

  const density = candles.length / Math.max(1, (x1 - x0) / 12);
  const quality = Math.round(
    Math.max(0, Math.min(100,
      35 + Math.min(35, candles.length * 1.2) + Math.min(20, density * 15) + (w >= 600 ? 10 : 0)
    ))
  );

  return { w, h, x0, x1, y0, y1, candles, quality };
}
