import React from "react";

const LABELS = { END_OF_DAY: "END OF DAY", DELAYED: "15-MIN DELAY", LIVE: "LIVE" };

export default function DataStatus({ status, provider, updated }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
      <span className="px-1.5 py-0.5 rounded ring-1 ring-slate-200 font-medium text-slate-500">{LABELS[status] || status || "UNKNOWN"}</span>
      {provider && <span>{provider === "twelvedata" ? "Twelve Data" : provider}</span>}
      {updated && <span>· {updated}</span>}
    </span>
  );
}
