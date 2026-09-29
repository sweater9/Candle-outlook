import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Star, AlertTriangle, Info, ChevronRight, Search, Microscope, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useStored, fmt } from "@/lib/store";
import CandlestickChart from "@/components/CandlestickChart";
import StatusBadge from "@/components/StatusBadge";
import ScoreBadge from "@/components/ScoreBadge";
import FiftyTwoWeekRange from "@/components/FiftyTwoWeekRange";
import CandlestickAnalyzer from "@/components/CandlestickAnalyzer";
import DataStatus from "@/components/DataStatus";
import EmptyState from "@/components/EmptyState";
import NotConfigured from "@/components/NotConfigured";

const RANGES = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y"];

function Metric({ label, value, tone }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone || "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5 text-slate-500"><span className="w-3 h-0.5 rounded" style={{ background: color }} />{label}</span>;
}

export default function Analyze() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [symbolInput, setSymbolInput] = useState(symbol || "");
  const [range, setRange] = useState("6M");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(null);
  const [watchlist, setWatchlist] = useStored("watchlist", []);
  const [ai, setAi] = useState({ loading: false, text: null, error: null, notConfigured: null });
  const added = watchlist.some((w) => w.symbol === symbol);

  useEffect(() => { setSymbolInput(symbol); }, [symbol]);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setError(null); setNotConfigured(null); setData(null);
      try {
        const d = await api.instrument(symbol, range);
        if (!live) return;
        if (d.status === "not_configured") setNotConfigured(d.message);
        else if (d.status !== "ok") setError(d.message || "No data");
        else setData(d);
      } catch (e) { if (live) setError(e.message || "Failed to load"); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [symbol, range]);

  useEffect(() => {
    let live = true;
    setAi({ loading: true, text: null, error: null, notConfigured: null });
    api.ai(symbol).then((r) => {
      if (!live) return;
      if (r.status === "not_configured") setAi({ loading: false, text: null, error: null, notConfigured: r.message });
      else if (r.status !== "ok") setAi({ loading: false, text: null, error: r.message, notConfigured: null });
      else setAi({ loading: false, text: r.analysis, error: null, notConfigured: null, model: r.model });
    }).catch((e) => live && setAi({ loading: false, text: null, error: e.message, notConfigured: null }));
    return () => { live = false; };
  }, [symbol]);

  const goSymbol = (e) => {
    e.preventDefault();
    const s = symbolInput.trim().toUpperCase();
    if (s && s !== symbol) navigate(`/analyze/${s}`);
  };
  const addToWatchlist = () => { if (!added) setWatchlist([...watchlist, { symbol, entry: "", exit: "" }]); };

  const ind = data?.indicators;
  const setup = data?.setup;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="w-4 h-4" /> Back</button>
        <form onSubmit={goSymbol} className="flex items-center gap-1.5">
          <div className="relative">
            <input value={symbolInput} onChange={(e) => setSymbolInput(e.target.value.toUpperCase())} placeholder="Symbol" aria-label="Symbol"
              className="w-28 sm:w-36 px-3 py-1.5 pr-8 rounded-lg text-sm font-medium uppercase ring-1 ring-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <button type="submit" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700">Go</button>
        </form>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{symbol}</h1>
          <div className="mt-1.5 flex items-center gap-3">
            {ind && <span className="text-lg tabular-nums text-slate-700">{fmt.money(ind.lastClose)}</span>}
            {ind?.pctChange != null && <span className={`text-sm font-medium tabular-nums ${ind.pctChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt.pct(ind.pctChange)}</span>}
            {data && <DataStatus status={data.data_status} provider={data.provider} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/research/${symbol}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50"><Microscope className="w-4 h-4 text-slate-500" /> Research</Link>
          <Link to={`/risk/${symbol}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50"><ShieldAlert className="w-4 h-4 text-slate-500" /> Risk</Link>
          <button onClick={addToWatchlist} disabled={added || !data} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60">
            <Star className={`w-4 h-4 ${added ? "fill-amber-400 text-amber-400" : "text-slate-500"}`} />{added ? "On Watchlist" : "Add to Watchlist"}
          </button>
        </div>
      </header>

      <div className="flex gap-1 mb-4 bg-white rounded-xl ring-1 ring-slate-200/70 p-1 w-fit">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${range === r ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{r}</button>
        ))}
      </div>

      {loading && (
        <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-16 flex flex-col items-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mb-2" /><span className="text-sm">Fetching market data &amp; computing indicators…</span>
        </div>
      )}
      {notConfigured && <NotConfigured message={notConfigured} />}
      {error && !loading && !notConfigured && <EmptyState icon={AlertTriangle} title="Data unavailable" description={error} />}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-slate-200/70 p-4">
            <CandlestickChart candles={data.candles} series={ind.series} height={420} />
            <div className="flex flex-wrap gap-4 mt-3 text-[11px]">
              {ind.series ? (<><Legend color="#2563eb" label="EMA 20" /><Legend color="#f59e0b" label="EMA 50" /><Legend color="#8b5cf6" label="SMA 200" /></>)
                : <span className="text-slate-400">Moving-average overlays are shown on 1M–1Y daily ranges.</span>}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
              <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-slate-700">Setup Analysis</h2><StatusBadge status={setup.status} /></div>
              <div className="flex items-center justify-between mb-3">
                <div><div className="text-xs text-slate-400">Type</div><div className="font-semibold text-slate-800">{setup.setupType}</div></div>
                <ScoreBadge score={setup.score} breakdown={setup.breakdown} size="lg" />
              </div>
              <div className="space-y-1">
                {setup.reasons.map((r, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed"><ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" /><span>{r}</span></div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
              <h2 className="font-semibold text-slate-700 mb-1">Indicators</h2>
              <Metric label="Trend" value={ind.trend} tone={ind.trend === "BULLISH" ? "text-emerald-600" : ind.trend === "BEARISH" ? "text-rose-600" : ""} />
              <Metric label="Momentum" value={ind.momentum || "—"} />
              <Metric label="RSI (14)" value={fmt.num(ind.rsi, 1)} tone={ind.rsi > 70 ? "text-rose-600" : ind.rsi < 30 ? "text-emerald-600" : ""} />
              <Metric label="MACD" value={fmt.num(ind.macd, 3)} />
              <Metric label="ATR (14)" value={ind.atr != null ? fmt.money(ind.atr) : "—"} />
              <Metric label="Volatility (ann.)" value={ind.volatility != null ? ind.volatility.toFixed(1) + "%" : "—"} />
              <Metric label="Volume vs 20-day" value={ind.volRatio != null ? ind.volRatio.toFixed(2) + "×" : "—"} tone={ind.volRatio > 1.3 ? "text-sky-600" : ""} />
              <Metric label="Support" value={fmt.money(ind.support)} />
              <Metric label="Resistance" value={fmt.money(ind.resistance)} />
              <Metric label="52-wk High" value={fmt.money(ind.high52)} />
              <Metric label="Dist. from 52-wk high" value={ind.distHigh52 != null ? ind.distHigh52.toFixed(1) + "%" : "—"} />
              <Metric label="Risk/Reward (to S/R)" value={setup.rrRatio != null ? setup.rrRatio.toFixed(2) + " : 1" : "—"} />
            </div>
            <FiftyTwoWeekRange high52={ind.high52} low52={ind.low52} lastClose={ind.lastClose} />
          </div>
        </div>
      )}

      {data && !loading && <div className="mt-5"><CandlestickAnalyzer candles={data.candles} /></div>}

      {data && !loading && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> Technical Thesis</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{data.thesis}</p>
            <p className="text-[11px] text-slate-400 mt-3">Generated from calculated indicators only. No levels or values are invented by AI.</p>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Calculation Details</h2>
            <div className="space-y-2 text-xs text-slate-500 leading-relaxed">
              <p>• <b className="text-slate-600">Trend:</b> price vs EMA20, EMA50 &amp; SMA200 (SMA200 only when 200 bars exist).</p>
              <p>• <b className="text-slate-600">RSI:</b> 14-period Wilder's smoothing.</p>
              <p>• <b className="text-slate-600">MACD:</b> EMA12 − EMA26, 9-period signal.</p>
              <p>• <b className="text-slate-600">ATR:</b> 14-period Wilder's average true range.</p>
              <p>• <b className="text-slate-600">Support/Resistance:</b> 20-bar swing low/high (excl. current bar).</p>
              <p>• <b className="text-slate-600">Stop:</b> lower of close − 1.5×ATR and support − 0.25×ATR. <b className="text-slate-600">Targets:</b> nearest resistance, then 52-week high.</p>
              <p>• <b className="text-slate-600">Setup Score:</b> Technical 35, Momentum 20, Fundamentals 15, Catalysts 10, Risk/Reward 20. Fundamentals and Catalysts are not scored by the scanner, so the maximum reachable here is 75.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <DataStatus status={data.data_status} updated={new Date(data.lastUpdated).toLocaleTimeString()} provider={data.provider} />
            </div>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="mt-5 bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
          <h2 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> AI Analysis
            <span className="text-[10px] font-medium text-slate-400 ring-1 ring-slate-200 rounded px-1.5 py-0.5">NVIDIA NIM</span></h2>
          {ai.loading && <div className="flex items-center gap-2 text-slate-400 text-sm py-3"><Loader2 className="w-4 h-4 animate-spin" /> Generating analysis from calculated indicators…</div>}
          {!ai.loading && ai.notConfigured && <p className="text-sm text-amber-700">{ai.notConfigured} <Link to="/settings" className="underline">Open Settings</Link></p>}
          {!ai.loading && ai.error && <p className="text-sm text-rose-600">{ai.error}</p>}
          {!ai.loading && ai.text && (<>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{ai.text}</p>
            <p className="text-[11px] text-slate-400 mt-3">Generated by NVIDIA NIM ({ai.model}) from the calculated indicators above. The model is instructed not to add prices, fundamentals or news.</p>
          </>)}
        </div>
      )}

      <p className="mt-6 text-[11px] text-slate-400 max-w-2xl leading-relaxed">Research &amp; decision support only. Not investment advice. No automated trade execution. Past performance and calculated scores do not guarantee future results.</p>
    </div>
  );
}
