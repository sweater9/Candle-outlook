import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { PATTERN_LIBRARY, biasWindow, classify, detectAll, reliability } from "@/lib/patterns";

const BLOCK = { bullish: "bg-emerald-500", bearish: "bg-rose-500", neutral: "bg-slate-300" };
const BIAS_TONE = { BULLISH: "text-emerald-600", BEARISH: "text-rose-600", MIXED: "text-slate-500" };
const dateOf = (t) => String(t).slice(0, 10);

export default function CandlestickAnalyzer({ candles }) {
  const [n, setN] = useState(10);
  const [h, setH] = useState(5);
  const [libOpen, setLibOpen] = useState(null);
  const patterns = useMemo(() => detectAll(candles), [candles]);
  const bias = biasWindow(candles, n);
  const rel = useMemo(() => reliability(candles, patterns, h), [candles, patterns, h]);
  const recent = patterns.slice(-8).reverse();
  const scan = candles.slice(-Math.min(candles.length, 60));

  const Toggle = ({ value, set, opts }) => (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
      {opts.map((o) => (
        <button key={o} onClick={() => set(o)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${value === o ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>{o}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Candlesticks</h2>
          <Toggle value={n} set={setN} opts={[1, 5, 10]} />
        </div>
        <div className="flex gap-0.5 flex-wrap mb-3" aria-label="Block scan of the last 60 candles">
          {scan.map((c, i) => <span key={i} title={`${dateOf(c.time)} ${classify(c)}`} className={`w-2.5 h-5 rounded-sm ${BLOCK[classify(c)]}`} />)}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>Last {bias.n} candle{bias.n === 1 ? "" : "s"}: <b className={BIAS_TONE[bias.label]}>{bias.label}</b></span>
          <span className="text-emerald-600 tabular-nums">Bullish {bias.bullPct.toFixed(0)}%</span>
          <span className="text-rose-600 tabular-nums">Bearish {bias.bearPct.toFixed(0)}%</span>
          <span className="text-slate-500 tabular-nums">Neutral {bias.neutralPct.toFixed(0)}%</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Each block is one loaded candle: green closed up, red closed down, grey had a body under 10% of its range. This describes past candles, it is not a forecast.</p>
        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recent.map((p) => <span key={p.index} className="text-xs px-2 py-1 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-600">{dateOf(p.time)} · {p.name}</span>)}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Historical Reliability</h2>
          <div className="flex items-center gap-2 text-xs text-slate-400">Higher close after <Toggle value={h} set={setH} opts={[1, 5, 10]} /> bars</div>
        </div>
        {rel.length === 0 ? <p className="text-sm text-slate-400">No patterns with enough following bars in the loaded window.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-1.5">Pattern</th><th className="text-right">Occurrences</th><th className="text-right">Higher close</th><th className="text-right">Avg move</th></tr></thead>
            <tbody>
              {rel.sort((a, b) => b.n - a.n).map((s) => (
                <tr key={s.name} className="border-t border-slate-50">
                  <td className="py-2">{s.name}</td>
                  <td className="text-right tabular-nums">{s.n}×</td>
                  <td className="text-right tabular-nums">{s.n < 3 ? "—" : `${s.higher}× (${s.pct.toFixed(0)}%)`}</td>
                  <td className="text-right tabular-nums">{s.n < 3 ? "—" : `${s.avgMove >= 0 ? "+" : ""}${s.avgMove.toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Backtest over the loaded historical window only. Fewer than 3 occurrences are not shown. Past frequency is not a prediction of future results.</p>
      </section>

      <section className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
        <h2 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> Pattern Library</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {PATTERN_LIBRARY.map((p) => (
            <button key={p.name} onClick={() => setLibOpen(libOpen === p.name ? null : p.name)} className="text-left rounded-lg ring-1 ring-slate-200 p-3 hover:bg-slate-50">
              <div className="flex justify-between text-sm font-medium text-slate-700"><span>{p.name}</span>
                <span className={`text-[11px] ${p.bias === "bullish" ? "text-emerald-600" : p.bias === "bearish" ? "text-rose-600" : "text-slate-400"}`}>{p.bias}</span></div>
              <p className="text-xs text-slate-500 mt-1">{p.text}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
