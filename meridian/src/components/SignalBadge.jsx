import React from "react";

const TONES = {
  BUY: "bg-emerald-600 text-white",
  SELL: "bg-rose-600 text-white",
  HOLD: "bg-sky-600 text-white",
  WAIT: "bg-slate-200 text-slate-700",
};

export default function SignalBadge({ signal, large }) {
  return (
    <span className={`inline-flex items-center rounded-lg font-bold tracking-wide ${large ? "px-4 py-1.5 text-base" : "px-2.5 py-1 text-xs"} ${TONES[signal] || TONES.WAIT}`}>
      {signal}
    </span>
  );
}
