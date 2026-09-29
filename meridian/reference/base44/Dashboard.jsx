import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Radar, ScanLine, TrendingUp, Bell, ClipboardList, ArrowRight, Activity,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import ScoreBadge from "@/components/ScoreBadge";
import EmptyState from "@/components/EmptyState";

function StatCard({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <Icon className="w-4 h-4 text-slate-300" strokeWidth={1.75} />
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${tone || "text-slate-800"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [setups, setSetups] = useState([]);
  const [scanRuns, setScanRuns] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, runs, wl, p] = await Promise.all([
          base44.entities.Setup.list("-score", 12).catch(() => []),
          base44.entities.ScanRun.list("-created_date", 1).catch(() => []),
          base44.entities.Watchlist.list().catch(() => []),
          base44.entities.TradePlan.list("-created_date", 5).catch(() => []),
        ]);
        setSetups(Array.isArray(s) ? s : []);
        setScanRuns(Array.isArray(runs) ? runs : []);
        setWatchlist(Array.isArray(wl) ? wl : []);
        setPlans(Array.isArray(p) ? p : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const latest = scanRuns[0];
  const qualified = setups.filter((s) => s.status && s.status !== "NO SETUP" && s.status !== "NO DATA");

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Market setup discovery &amp; trade decision support.</p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={ScanLine} label="Markets Scanned" value={latest?.markets_scanned ?? "—"}
          sub={latest?.universe || "No scan yet"} />
        <StatCard icon={Activity} label="Qualified Setups" value={latest?.qualified_count ?? "—"}
          sub={qualified.length ? `${qualified.length} shown below` : "Run a scan"}
          tone={qualified.length ? "text-emerald-600" : "text-slate-800"} />
        <StatCard icon={TrendingUp} label="Top Setup Score" value={setups[0]?.score ?? "—"}
          sub={setups[0]?.symbol || "No data"} tone="text-sky-600" />
        <StatCard icon={Bell} label="Watchlist Items" value={watchlist.length}
          sub={watchlist.length ? "Tracking changes" : "Empty"} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-slate-200/70 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Top Setups</h2>
            <Link to="/scan" className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
              Run scan <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : setups.length === 0 ? (
            <EmptyState icon={Radar} title="No setups yet"
              description="Run a market scan to discover and rank trade setups with transparent scores."
              action={<Link to="/scan" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
                <ScanLine className="w-4 h-4" /> Open Market Scan
              </Link>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-2.5 font-medium">Symbol</th>
                    <th className="px-3 py-2.5 font-medium text-right">Price</th>
                    <th className="px-3 py-2.5 font-medium text-right">Chg</th>
                    <th className="px-3 py-2.5 font-medium">Setup</th>
                    <th className="px-3 py-2.5 font-medium text-center">Score</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {setups.slice(0, 10).map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link to={`/analyze/${s.symbol}`} className="font-semibold text-slate-800 hover:text-sky-600">
                          {s.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {s.price ? "$" + s.price.toFixed(2) : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums font-medium ${(s.change_pct || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${s.change_pct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{s.setup_type}</td>
                      <td className="px-3 py-3 text-center">
                        <ScoreBadge score={s.score} breakdown={s.score_breakdown} />
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Market Regime</h2>
            <div className="space-y-2.5 text-sm">
              {[
                { k: "S&P 500 trend", v: "Data unavailable" },
                { k: "Nasdaq trend", v: "Data unavailable" },
                { k: "Volatility env.", v: "Data unavailable" },
                { k: "Market breadth", v: "Data unavailable" },
              ].map((r) => (
                <div key={r.k} className="flex justify-between">
                  <span className="text-slate-500">{r.k}</span>
                  <span className="text-slate-400 text-xs">{r.v}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                Market regime populates once an index scan and breadth data are configured.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Recent Plans</h2>
            {plans.length === 0 ? (
              <p className="text-sm text-slate-400">No trade plans generated yet.</p>
            ) : (
              <div className="space-y-2">
                {plans.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <Link to={`/analyze/${p.symbol}`} className="font-medium text-slate-700 hover:text-sky-600">{p.symbol}</Link>
                    <span className="text-slate-400 text-xs">{p.setup_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
