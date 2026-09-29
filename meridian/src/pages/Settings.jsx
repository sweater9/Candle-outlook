import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

function Row({ ok, name, envVar, note }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" /> : <XCircle className="w-5 h-5 text-slate-300 mt-0.5" />}
      <div><div className="font-medium text-slate-700">{name} <span className="text-xs font-normal text-slate-400">{ok ? "Configured" : "Not configured"}</span></div>
        <div className="text-xs text-slate-500 mt-0.5">Server env var <code className="px-1 py-0.5 rounded bg-slate-100">{envVar}</code>. {note}</div></div>
    </div>
  );
}

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.status().then(setStatus).catch(() => setError("Cannot reach the API server (is server/app.py running?).")); }, []);
  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-6">Settings</h1>
      <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
        <h2 className="font-semibold text-slate-700 mb-2">Data providers</h2>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {status && (<>
          <Row ok={status.twelvedata} name="Twelve Data (market data, fundamentals)" envVar="TWELVEDATA_API_KEY" note="Keys are read by the Flask server only and never sent to the browser." />
          <Row ok={status.nvidia_nim} name="NVIDIA NIM (AI explanation)" envVar="NVIDIA_NIM_API_KEY" note="Optional: NVIDIA_NIM_MODELS is a comma-separated list of models tried in order." />
        </>)}
      </div>
      <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5 mt-5 text-sm text-slate-600 leading-relaxed">
        <h2 className="font-semibold text-slate-700 mb-2">Risk disclosure</h2>
        Meridian is market research and decision-support software. It does not execute trades and does not provide investment advice. Setup Scores rank how well a setup meets fixed rules; they are not probabilities of profit. Historical statistics do not guarantee future results. Data is end-of-day unless labelled otherwise; nothing is estimated or fabricated, and unavailable data is shown as such.
      </div>
    </div>
  );
}
