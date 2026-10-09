// Pixel-space candle extraction. No OHLC prices are fabricated: every
// number produced here is derived directly from pixel geometry in the
// uploaded screenshot, in pixel units, unless the caller supplies a
// price calibration (see calibrate.js-style helpers in scenario.js).

function classifyPixel(r, g, b, colors) {
  if (colors) {
    const distance = color => (color[0]-r)**2+(color[1]-g)**2+(color[2]-b)**2;
    const up = distance(colors.up), down = distance(colors.down);
    return Math.min(up,down) < 80**2 ? (up < down ? 1 : -1) : 0;
  }
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx - mn;
  if (g > r * 1.08 && g > b * 1.03 && s > 28) return 1; // bullish (green-ish)
  if (r > g * 1.08 && r > b * 1.02 && s > 28) return -1; // bearish (red-ish)
  return 0;
}

// Scans an <img> through an offscreen <canvas>, groups colored columns
// into candle bodies/wicks, and returns pixel-space candle geometry plus
// a 0-100 read-quality score for how reliable that geometry is.
export function extractCandles(img, canvas, opts = {}) {
  const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
  const colors=opts.colors?{up:rgb(opts.colors.up),down:rgb(opts.colors.down)}:null;
  const maxWidth = opts.maxWidth || 1200;
  const sc = Math.min(1, maxWidth / img.naturalWidth);
  const w = Math.round(img.naturalWidth * sc);
  const h = Math.round(img.naturalHeight * sc);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const crop = opts.crop || {left:4,right:94,top:4,bottom:90};
  const x0 = Math.round(w*crop.left/100), x1 = Math.round(w*crop.right/100);
  const y0 = Math.round(h*crop.top/100), y1 = Math.round(h*crop.bottom/100);

  const cols = [];
  for (let x = x0; x < x1; x++) {
    const ys = [];
    let bu = 0, be = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * 4;
      const k = classifyPixel(data[i], data[i + 1], data[i + 2], colors);
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
      // Body rows occupy multiple adjacent colored pixels; a wick is thin.
      const runs = []; let run = null;
      for (let y=g.top;y<=g.bottom;y++) {
        let count=0;
        for(let x=g.x1;x<=g.x2;x++){const i=(y*w+x)*4;if(classifyPixel(data[i],data[i+1],data[i+2],colors))count++;}
        if(count>=Math.max(2,Math.ceil((g.x2-g.x1+1)*0.6))){if(!run)run={top:y,bottom:y};else run.bottom=y;}
        else if(run){runs.push(run);run=null;}
      }
      if(run)runs.push(run);
      const body=runs.sort((a,b)=>(b.bottom-b.top)-(a.bottom-a.top))[0];
      const bodyTop=body?body.top:(g.top+g.bottom)/2;
      const bodyBottom=body?body.bottom:bodyTop;
      const bodyRatio=Math.min(1,Math.max(1,bodyBottom-bodyTop)/range);
      const wickRatio=1-bodyRatio, dir=g.bu>=g.be?1:-1;
      const mid=(g.top+g.bottom)/2;
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
