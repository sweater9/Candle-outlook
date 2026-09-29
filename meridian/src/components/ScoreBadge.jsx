import React, { useState } from "react";
import { X } from "lucide-react";

export function scoreTone(score) {
  return score >= 70 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-slate-500";
}

export default function ScoreBadge({ score, breakdown, size }) {
  const [open, setOpen] = useState(false);
  const big = size === "lg";
  return (
    <>
      <button onClick={() => breakdown && setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md font-bold bg-white ring-1 ring-slate-200 hover:ring-slate-300 transition ${big ? "px-3 py-1.5 text-lg" : "px-2 py-0.5 text-xs"} ${scoreTone(score)}`}
        title="Click for the score breakdown">
        {score ?? "—"}<span className="text-slate-300 font-normal">/100</span>
      </button>
      {open && breakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Setup Score breakdown</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              {breakdown.map((b) => (
                <div key={b.name}>
                  <div className="flex justify-between text-sm font-medium text-slate-700">
                    <span>{b.name}</span><span className="tabular-nums">{b.score}/{b.max}</span>
                  </div>
                  {b.note && <p className="text-xs text-slate-400 mt-0.5">{b.note}</p>}
                  {b.items.map((i) => (
                    <div key={i.label} className="flex gap-2 justify-between text-xs text-slate-500 mt-1">
                      <span><span className="text-slate-600 font-medium">{i.label}:</span> {i.note}</span>
                      <span className="tabular-nums shrink-0">{i.points}/{i.max}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between font-semibold text-slate-800">
              <span>TOTAL</span><span className="tabular-nums">{score}/100</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">A Setup Score ranks how well a setup meets fixed rules. It is not a probability of profit.</p>
          </div>
        </div>
      )}
    </>
  );
}
