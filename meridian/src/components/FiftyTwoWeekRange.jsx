import React from "react";
import { fmt } from "@/lib/store";

export default function FiftyTwoWeekRange({ high52, low52, lastClose }) {
  if (high52 == null || low52 == null || lastClose == null) return null;
  const span = high52 - low52;
  const pos = span > 0 ? Math.min(100, Math.max(0, ((lastClose - low52) / span) * 100)) : 50;
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
      <h2 className="font-semibold text-slate-700 mb-3">52-Week Range</h2>
      <div className="relative h-2 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky-200" style={{ width: `${pos}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-900 ring-2 ring-white" style={{ left: `calc(${pos}% - 6px)` }} />
      </div>
      <div className="flex justify-between mt-2 text-xs tabular-nums text-slate-500">
        <span>{fmt.money(low52)}<br /><span className="text-slate-400">{((lastClose / low52 - 1) * 100).toFixed(1)}% above low</span></span>
        <span className="text-right">{fmt.money(high52)}<br /><span className="text-slate-400">{((lastClose / high52 - 1) * 100).toFixed(1)}% from high</span></span>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Computed from the last 252 daily bars. Historical only.</p>
    </div>
  );
}
