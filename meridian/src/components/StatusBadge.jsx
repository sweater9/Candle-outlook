import React from "react";

const TONES = {
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  WATCH: "bg-sky-50 text-sky-700 ring-sky-200",
  EARLY: "bg-amber-50 text-amber-700 ring-amber-200",
  EXTENDED: "bg-orange-50 text-orange-700 ring-orange-200",
  RISKY: "bg-rose-50 text-rose-700 ring-rose-200",
  AVOID: "bg-red-50 text-red-700 ring-red-200",
  "NO SETUP": "bg-slate-50 text-slate-500 ring-slate-200",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ring-1 ring-inset ${TONES[status] || TONES["NO SETUP"]}`}>
      {status || "—"}
    </span>
  );
}
