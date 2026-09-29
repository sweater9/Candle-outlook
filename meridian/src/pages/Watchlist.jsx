import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trophy, Plus, Trash2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useStored, fmt } from "@/lib/store";
import SignalBadge from "@/components/SignalBadge";
import ScoreBadge from "@/components/ScoreBadge";
import NotConfigured from "@/components/NotConfigured";
import EmptyState from "@/components/EmptyState";

// Support -> resistance track with current price, and the structural target arrow.
function ExpectedMove({ row }) {
  const { support, resistance, price, signal, atr } = row;
  const span = resistance - support;
  const pos = span > 0 ? Math.min(100, Math.max(0, ((price - support) / span) * 100)) : 50;
  const arrow = signal === "BUY" || signal === "HOLD" ? "▲" : signal === "SELL" ? "▼" : "◆";
  const tone = signal === "BUY" || signal === "HOLD" ? "text-emerald-600" : signal === "SELL" ? "text-rose-600" : "text-slate-400";
  const label = row.target && signal !== "WAIT" ? `${arrow} ${fmt.pct((row.target / price - 1) * 100, 1)} to ${fmt.money(row.target)}` : `Daily range ±${fmt.money(atr)} (ATR)`;
  return (
    <div className="min-w-[180px]">
      <div className="relative h-1.5 rounded-full bg-slate-100 my-2">
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-900 ring-2 ring-white" style={{ left: `calc(${pos}% - 5px)` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 tabular-nums"><span>{fmt.money(support)}</span><span>{fmt.money(resistance)}</span></div>
      <div className={`text-xs font-medium mt-1 ${tone}`}>{label}</div>
    </div>
  );
}

export default function Watchlist() {
  const [list, setList] = useStored("watchlist", []);
  const [result, setResult] = useStored("watchlistResult", null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(null);

  const add = (e) => {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (s && !list.some((w) => w.symbol === s)) setList([...list, { symbol: s, entry: "", exit: "" }]);
    setInput("");
  };
  const edit = (sym, key, val) => setList(list.map((w) => (w.symbol === sym ? { ...w, [key]: val } : w)));

  const run = async () => {
    setBusy(true); setError(null); setNotConfigured(null);
    try {
      const res = await api.watchlist(list.map((w) => w.symbol));
      if (res.status === "not_configured") setNotConfigured(res.message);
      else if (res.status !== "ok") setError(res.message);
      else setResult(res);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // Level alerts: computed from the last analysis against the user's entry/exit levels.
  const alerts = (result?.results || []).flatMap((r) => {
    const w = list.find((x) => x.symbol === r.symbol);
    if (!w) return [];
    const out = [];
    if (w.entry !== "" && r.price >= Number(w.entry)) out.push(`${r.symbol} closed at ${fmt.money(r.price)}, at or above your entry level ${fmt.money(Number(w.entry))}.`);
    if (w.exit !== "" && r.price <= Number(w.exit)) out.push(`${r.symbol} closed at ${fmt.money(r.price)}, at or below your exit level ${fmt.money(Number(w.exit))}.`);
    return out;
  });
  const best = result?.best_buy;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6"><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-1 text-sm text-slate-500">Rank your symbols and see a BUY / HOLD / WAIT / SELL read derived from calculated indicators.</p></header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form onSubmit={add} className="flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Add symbol" className="w-32 px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-white text-sm uppercase" />
          <button className="px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-white hover:bg-slate-50"><Plus className="w-4 h-4" /></button>
        </form>
        <button onClick={run} disabled={busy || !list.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Analyze Watchlist
        </button>
      </div>

      {notConfigured && <NotConfigured message={notConfigured} />}
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      {result && (
        best ? (
          <div className="bg-emerald-50 ring-1 ring-emerald-200 rounded-2xl p-5 mb-5 flex flex-wrap items-center justify-between gap-4">
            <div><div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wide"><Trophy className="w-4 h-4" /> Best setup on your watchlist today</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{best.symbol} <span className="text-base text-slate-500 font-normal">{fmt.money(best.price)} · {best.setup_type} · score {best.score}/100</span></div>
              <p className="text-xs text-slate-500 mt-1">{best.reasons.join(" ")}</p></div>
            <div className="flex gap-2"><Link to={`/analyze/${best.symbol}`} className="px-3 py-2 rounded-lg bg-white ring-1 ring-slate-200 text-sm">Analyze</Link>
              <Link to={`/risk/${best.symbol}`} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">Size position</Link></div>
          </div>
        ) : <div className="bg-slate-100 rounded-2xl p-4 mb-5 text-sm text-slate-600">No watchlist symbol has a READY setup right now. Waiting is a valid outcome.</div>
      )}

      {alerts.length > 0 && (
        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-4 mb-5 space-y-1">
          <h2 className="text-sm font-semibold text-amber-800">Level alerts</h2>
          {alerts.map((a, i) => <p key={i} className="text-sm text-amber-700">{a}</p>)}
          <p className="text-[11px] text-amber-600">Checked against the latest end-of-day close, when you last ran the analysis.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 overflow-x-auto">
        {list.length === 0 ? <EmptyState title="Watchlist is empty" description="Add a symbol above." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-5 py-2.5 font-medium">Symbol</th><th className="px-3 font-medium">Signal</th><th className="px-3 font-medium text-right">Price</th>
              <th className="px-3 font-medium text-center">Score</th><th className="px-3 font-medium">Expected move</th><th className="px-3 font-medium">Entry ≥</th><th className="px-3 font-medium">Exit ≤</th><th /></tr></thead>
            <tbody>
              {list.map((w) => {
                const r = result?.results?.find((x) => x.symbol === w.symbol);
                return (
                  <tr key={w.symbol} className="border-b border-slate-50 align-middle">
                    <td className="px-5 py-3"><Link to={`/analyze/${w.symbol}`} className="font-semibold hover:text-sky-600">{w.symbol}</Link></td>
                    <td className="px-3 py-3">{r ? <SignalBadge signal={r.signal} /> : <span className="text-xs text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r ? fmt.money(r.price) : "—"}</td>
                    <td className="px-3 py-3 text-center">{r ? <ScoreBadge score={r.score} breakdown={r.score_breakdown} /> : "—"}</td>
                    <td className="px-3 py-3">{r ? <ExpectedMove row={r} /> : <span className="text-xs text-slate-300">Run analysis</span>}</td>
                    <td className="px-3 py-3"><input type="number" value={w.entry} onChange={(e) => edit(w.symbol, "entry", e.target.value)} className="w-20 px-2 py-1 rounded ring-1 ring-slate-200 text-xs" /></td>
                    <td className="px-3 py-3"><input type="number" value={w.exit} onChange={(e) => edit(w.symbol, "exit", e.target.value)} className="w-20 px-2 py-1 rounded ring-1 ring-slate-200 text-xs" /></td>
                    <td className="px-3"><button onClick={() => setList(list.filter((x) => x.symbol !== w.symbol))} aria-label={`Remove ${w.symbol}`}><Trash2 className="w-4 h-4 text-slate-300 hover:text-rose-500" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-4 text-[11px] text-slate-400 max-w-2xl">BUY = READY setup. HOLD = bullish trend without a fresh trigger. WAIT = forming, extended or unclear. SELL = bearish trend with MACD below signal. Research and decision support only; not investment advice.</p>
    </div>
  );
}
