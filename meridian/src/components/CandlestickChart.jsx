import React, { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

const toTime = (t) => {
  if (typeof t === "string" && t.includes("T")) {
    if (t.slice(11, 19) === "00:00:00") return t.slice(0, 10); // daily / weekly bar
    return Math.floor(Date.parse(t) / 1000);
  }
  return t;
};

// levels: [{ price, color, title }] drawn as dashed horizontal lines (trade-plan overlay)
export default function CandlestickChart({ candles = [], series, height = 420, levels = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !candles.length) return;
    const chart = createChart(ref.current, {
      height, autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#64748b", fontSize: 11 },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const times = candles.map((c) => toTime(c.time));
    const cs = chart.addCandlestickSeries({
      upColor: "#059669", downColor: "#e11d48", borderVisible: false, wickUpColor: "#059669", wickDownColor: "#e11d48",
    });
    cs.setData(candles.map((c, i) => ({ time: times[i], open: c.open, high: c.high, low: c.low, close: c.close })));

    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(candles.map((c, i) => ({ time: times[i], value: c.volume, color: c.close >= c.open ? "#a7f3d0" : "#fecdd3" })));

    const overlays = [["ema20", "#2563eb"], ["ema50", "#f59e0b"], ["sma200", "#8b5cf6"]];
    if (series) {
      overlays.forEach(([key, color]) => {
        const arr = series[key];
        if (!arr) return;
        const data = arr.map((v, i) => (v == null ? null : { time: times[i], value: v })).filter(Boolean);
        if (!data.length) return;
        chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(data);
      });
    }
    levels.forEach((l) => {
      if (l.price == null) return;
      cs.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, series, height, JSON.stringify(levels)]);

  if (!candles.length) return <div className="text-sm text-slate-400 p-8 text-center">Data unavailable</div>;
  return <div ref={ref} style={{ height }} />;
}
