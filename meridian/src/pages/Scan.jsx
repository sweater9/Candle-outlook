import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ScanLine, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useStored, fmt } from "@/lib/store";
import StatusBadge from "@/components/StatusBadge";
import ScoreBadge from "@/components/ScoreBadge";
import NotConfigured from "@/components/NotConfigured";
import EmptyState from "@/components/EmptyState";

export default function Scan() {
  const [universes, setUniverses] = useState({});
  const [universe, setUniverse] = useState("sp500_core");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(null);
  const [scan, setScan] = useStored("lastScan", null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { api.universes().then(setUniverses).catch(() => setError("Cannot reach the API server.")); }, []);

  const run = async () => {
    setBusy(true); setError(null); setNotConfigured(null);
    try {
      const res = await api.scan(universe);
      if (res.status === "not_configured") setNotConfigured(res.message);
      else if (res.status !== "ok") setError(res.message || "Scan failed");
      else setScan(res);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6"><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Market Scan</h1>
        <p className="mt-1 text-sm text-slate-500">Rank a universe by explainable Setup Score. Click any score for its breakdown.</p></header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Universe</label>
        <select value={universe} onChange={(e) => setUniverse(e.target.value)} className="px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-white text-sm">
          {Object.entries(universes).map(([k, u]) => <option key={k} value={k}>{u.label} · {u.count} symbols</option>)}
        </select>
        <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} {busy ? "Scanning…" : "Run Scan"}
        </button>
      </div>

      {notConfigured && <NotConfigured message={notConfigured} />}
      {error && <div className="bg-rose-50 ring-1 ring-rose-200 rounded-2xl p-4 text-sm text-rose-700 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</div>}

      <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 overflow-hidden mt-4">
        {!scan ? <EmptyState icon={ScanLine} title="Ready to scan" description="Select a universe and run a scan. Results are ranked by Setup Score with a fully traceable breakdown." /> : (
          <>
            <div className="px-5 py-3 text-xs text-slate-400 border-b border-slate-100">
              {scan.universe} · {scan.analyzed}/{scan.markets_scanned} analyzed · {scan.qualified_count} qualified · {new Date(scan.scannedAt).toLocaleString()} · end-of-day data
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-medium">Symbol</th><th className="px-3 font-medium text-right">Price</th><th className="px-3 font-medium text-right">Chg</th>
                  <th className="px-3 font-medium">Setup</th><th className="px-3 font-medium text-center">Score</th><th className="px-3 font-medium text-right">R:R</th><th className="px-5 font-medium">Status</th></tr></thead>
                <tbody>
                  {scan.results.map((s) => (
                    <React.Fragment key={s.symbol}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => setExpanded(expanded === s.symbol ? null : s.symbol)}>
                        <td className="px-5 py-3"><Link onClick={(e) => e.stopPropagation()} to={`/analyze/${s.symbol}`} className="font-semibold hover:text-sky-600">{s.symbol}</Link></td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmt.money(s.price)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums font-medium ${(s.change_pct || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt.pct(s.change_pct)}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{s.setup_type}</td>
                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}><ScoreBadge score={s.score} breakdown={s.score_breakdown} /></td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-500">{s.rr_ratio != null ? s.rr_ratio.toFixed(2) + " : 1" : "—"}</td>
                        <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                      </tr>
                      {expanded === s.symbol && (
                        <tr className="bg-slate-50/60"><td colSpan={7} className="px-5 py-3 text-xs text-slate-500">
                          <b className="text-slate-600">Why {s.status}:</b> {s.reasons.join(" ")} Trend {s.trend}; RSI {fmt.num(s.rsi, 0)}; support {fmt.money(s.support)}; resistance {fmt.money(s.resistance)}.
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {scan.failed?.length > 0 && <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-50">Data unavailable for: {scan.failed.map((f) => f.symbol).join(", ")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
