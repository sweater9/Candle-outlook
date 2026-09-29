import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Search, LineChart, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/store";
import NotConfigured from "@/components/NotConfigured";

function Row({ label, value }) {
  return <div className="flex justify-between py-2 border-b border-slate-50 last:border-0 text-sm"><span className="text-slate-500 text-xs">{label}</span><span className="tabular-nums font-medium text-slate-700">{value}</span></div>;
}
const pctRaw = (v) => (v == null ? "—" : (Math.abs(v) <= 5 ? (v * 100).toFixed(1) : v.toFixed(1)) + "%");

export default function Research() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(symbol);
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState(null);
  const [nc, setNc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { setInput(symbol); }, [symbol]);
  useEffect(() => {
    let live = true;
    setLoading(true); setD(null); setNc(null); setError(null);
    api.research(symbol).then((r) => {
      if (!live) return;
      if (r.status === "not_configured") setNc(r.message); else if (r.status !== "ok") setError(r.message); else setD(r);
    }).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [symbol]);

  const f = d?.fundamentals;
  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500"><ArrowLeft className="w-4 h-4" /> Back</button>
        <form onSubmit={(e) => { e.preventDefault(); const s = input.trim().toUpperCase(); if (s) navigate(`/research/${s}`); }} className="flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} className="w-32 px-3 py-1.5 rounded-lg text-sm uppercase ring-1 ring-slate-200 bg-white" aria-label="Symbol" />
          <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"><Search className="w-4 h-4" /></button>
        </form>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{symbol} Research</h1>
          {d?.profile?.name && <p className="text-sm text-slate-500 mt-1">{d.profile.name} · {[d.profile.sector, d.profile.industry, d.profile.exchange].filter(Boolean).join(" · ")}</p>}</div>
        <div className="flex gap-2">
          <Link to={`/analyze/${symbol}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ring-1 ring-slate-200 bg-white"><LineChart className="w-4 h-4" /> Analyze</Link>
          <Link to={`/risk/${symbol}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ring-1 ring-slate-200 bg-white"><ShieldAlert className="w-4 h-4" /> Risk</Link>
        </div>
      </header>

      {loading && <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-16 flex flex-col items-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mb-2" /><span className="text-sm">Loading fundamentals…</span></div>}
      {nc && <NotConfigured message={nc} />}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-2">Valuation</h2>
            {d.errors?.fundamentals ? <p className="text-sm text-slate-400">Data unavailable ({d.errors.fundamentals})</p> : f && (<>
              <Row label="Market cap" value={fmt.big(f.market_cap)} /><Row label="P/E (TTM)" value={fmt.num(f.pe)} /><Row label="Forward P/E" value={fmt.num(f.forward_pe)} />
              <Row label="PEG" value={fmt.num(f.peg)} /><Row label="Price / sales" value={fmt.num(f.price_to_sales)} /><Row label="Price / book" value={fmt.num(f.price_to_book)} /><Row label="Beta" value={fmt.num(f.beta)} />
            </>)}
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-2">Financials</h2>
            {f && (<>
              <Row label="Revenue (TTM)" value={fmt.big(f.revenue)} /><Row label="Revenue growth (YoY, qtr)" value={pctRaw(f.revenue_growth_yoy)} />
              <Row label="EPS (diluted, TTM)" value={fmt.num(f.eps)} /><Row label="EPS growth (YoY, qtr)" value={pctRaw(f.eps_growth_yoy)} />
              <Row label="Profit margin" value={pctRaw(f.profit_margin)} /><Row label="Operating margin" value={pctRaw(f.operating_margin)} />
              <Row label="Free cash flow (levered, TTM)" value={fmt.big(f.free_cash_flow)} /><Row label="Total debt" value={fmt.big(f.total_debt)} /><Row label="Debt / equity" value={fmt.num(f.debt_to_equity)} />
            </>)}
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-2">Recent earnings</h2>
            {d.earnings?.length ? (
              <table className="w-full text-xs"><thead><tr className="text-left text-slate-400"><th className="py-1">Date</th><th className="text-right">Actual</th><th className="text-right">Est.</th><th className="text-right">Surprise</th></tr></thead>
                <tbody>{d.earnings.map((e) => (<tr key={e.date} className="border-t border-slate-50"><td className="py-1.5">{e.date}</td><td className="text-right tabular-nums">{fmt.num(e.eps_actual)}</td><td className="text-right tabular-nums">{fmt.num(e.eps_estimate)}</td>
                  <td className={`text-right tabular-nums ${e.surprise_pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{e.surprise_pct != null ? fmt.pct(e.surprise_pct, 1) : "—"}</td></tr>))}</tbody></table>
            ) : <p className="text-sm text-slate-400">Data unavailable</p>}
            <p className="text-[11px] text-slate-400 mt-3">Upcoming earnings dates need a paid calendar endpoint and are not shown.</p>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5 lg:col-span-2">
            <h2 className="font-semibold text-slate-700 mb-2">News &amp; catalysts</h2>
            <p className="text-sm text-slate-400">Data unavailable. {d.news.message} Every catalyst must carry a source, so none are generated.</p>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-2">About</h2>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-6">{d.profile?.description || "Data unavailable"}</p>
            <p className="text-[11px] text-slate-400 mt-3">Sources: {d.sources.join(", ")}. Fetched {new Date(d.fetchedAt).toLocaleTimeString()}.</p>
          </div>
        </div>
      )}
      <p className="mt-6 text-[11px] text-slate-400 max-w-2xl">Research &amp; decision support only. Not investment advice.</p>
    </div>
  );
}
