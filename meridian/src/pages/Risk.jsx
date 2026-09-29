import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Save, LineChart, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useStored, fmt } from "@/lib/store";
import CandlestickChart from "@/components/CandlestickChart";
import NotConfigured from "@/components/NotConfigured";

function Field({ label, value, onChange, step = "any", suffix }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <div className="mt-1 relative">
        <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-white text-sm text-slate-800 tabular-nums" />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{suffix}</span>}
      </div>
    </label>
  );
}

// Vertical ladder: TP2 / TP1 / ENTRY / STOP scaled to price.
function Ladder({ entry, stop, t1, t2 }) {
  const levels = [["TP2", t2, "bg-emerald-500"], ["TP1", t1, "bg-emerald-400"], ["ENTRY", entry, "bg-sky-500"], ["STOP", stop, "bg-rose-500"]].filter(([, v]) => v != null && v !== "" && !isNaN(v));
  if (levels.length < 2) return null;
  const vals = levels.map(([, v]) => Number(v));
  const hi = Math.max(...vals), lo = Math.min(...vals), span = hi - lo || 1;
  return (
    <div className="relative h-56 ml-2">
      <div className="absolute left-16 top-0 bottom-0 w-1 rounded bg-slate-100" />
      {levels.map(([name, v, color]) => (
        <div key={name} className="absolute left-0 right-0 flex items-center gap-3" style={{ top: `calc(${((hi - Number(v)) / span) * 100}% - 8px)` }}>
          <span className="w-12 text-[11px] font-semibold text-slate-500">{name}</span>
          <span className={`w-3 h-3 rounded-full ${color} ring-2 ring-white z-10`} />
          <span className="text-sm tabular-nums text-slate-700">{fmt.money(Number(v))}</span>
        </div>
      ))}
    </div>
  );
}

export default function Risk() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(symbol);
  const [settings, setSettings] = useStored("riskSettings", { account: "50000", risk_pct: "1", max_position_pct: "" });
  const [plan, setPlan] = useState({ entry: "", stop: "", target1: "", target2: "" });
  const [inst, setInst] = useState(null);
  const [nc, setNc] = useState(null);
  const [calc, setCalc] = useState(null);
  const [plans, setPlans] = useStored("plans", []);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setInput(symbol); }, [symbol]);
  useEffect(() => {
    let live = true;
    setInst(null); setNc(null); setCalc(null); setSaved(false);
    api.instrument(symbol, "6M").then((d) => {
      if (!live) return;
      if (d.status === "not_configured") return setNc(d.message);
      if (d.status !== "ok") return;
      setInst(d);
      const lv = d.setup.levels;
      const r = (v) => (v == null ? "" : Number(v).toFixed(2));
      setPlan({ entry: r(lv.entry), stop: r(lv.stop), target1: r(lv.target1), target2: r(lv.target2) });
    }).catch(() => {});
    return () => { live = false; };
  }, [symbol]);

  useEffect(() => {
    if (!plan.entry || !plan.stop || !settings.account || !settings.risk_pct) { setCalc(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api.risk({ account: settings.account, risk_pct: settings.risk_pct, entry: plan.entry, stop: plan.stop,
        target1: plan.target1, target2: plan.target2, max_position_pct: settings.max_position_pct }).then((r) => live && setCalc(r)).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [plan, settings]);

  const num = (v) => (v === "" || v == null ? null : Number(v));
  const save = () => {
    if (!calc?.ok) return;
    setPlans([{ id: Date.now(), symbol, savedAt: new Date().toISOString(), ...plan, shares: calc.shares, maxLoss: calc.maxLoss, account: settings.account, risk_pct: settings.risk_pct }, ...plans]);
    setSaved(true);
  };
  const setP = (k) => (v) => setPlan({ ...plan, [k]: v });
  const setS = (k) => (v) => setSettings({ ...settings, [k]: v });

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500"><ArrowLeft className="w-4 h-4" /> Back</button>
        <form onSubmit={(e) => { e.preventDefault(); const s = input.trim().toUpperCase(); if (s) navigate(`/risk/${s}`); }} className="flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} className="w-32 px-3 py-1.5 rounded-lg text-sm uppercase ring-1 ring-slate-200 bg-white" aria-label="Symbol" />
          <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"><Search className="w-4 h-4" /></button>
        </form>
      </div>
      <header className="flex items-end justify-between mb-6">
        <div><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{symbol} Risk Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Deterministic position sizing. Levels are prefilled from the latest calculated setup; edit any of them.</p></div>
        <Link to={`/analyze/${symbol}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ring-1 ring-slate-200 bg-white"><LineChart className="w-4 h-4" /> Analyze</Link>
      </header>
      {nc && <NotConfigured message={nc} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5 space-y-3">
            <h2 className="font-semibold text-slate-700">Account</h2>
            <Field label="Account value" value={settings.account} onChange={setS("account")} suffix="$" />
            <Field label="Max risk per trade" value={settings.risk_pct} onChange={setS("risk_pct")} suffix="%" />
            <Field label="Max position size (optional)" value={settings.max_position_pct} onChange={setS("max_position_pct")} suffix="%" />
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5 space-y-3">
            <h2 className="font-semibold text-slate-700">Trade levels</h2>
            <Field label="Entry" value={plan.entry} onChange={setP("entry")} suffix="$" />
            <Field label="Stop" value={plan.stop} onChange={setP("stop")} suffix="$" />
            <Field label="Target 1" value={plan.target1} onChange={setP("target1")} suffix="$" />
            <Field label="Target 2" value={plan.target2} onChange={setP("target2")} suffix="$" />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Position sizing</h2>
            {!calc ? <p className="text-sm text-slate-400">Enter account, risk %, entry and stop.</p> : !calc.ok ? (
              <ul className="text-sm text-rose-600 list-disc pl-5">{calc.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            ) : (<>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[["Shares", calc.shares], ["Position value", fmt.money(calc.positionValue)], ["Max loss", fmt.money(calc.maxLoss)], ["Account risk", calc.actualRiskPct.toFixed(2) + "%"]].map(([k, v]) => (
                  <div key={k}><div className="text-[11px] uppercase tracking-wide text-slate-400">{k}</div><div className="text-xl font-semibold tabular-nums">{v}</div></div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div><div className="text-[11px] uppercase text-slate-400">Risk capital</div>{fmt.money(calc.riskCapital)}</div>
                <div><div className="text-[11px] uppercase text-slate-400">Risk / share</div>{fmt.money(calc.riskPerShare)}</div>
                <div><div className="text-[11px] uppercase text-slate-400">Portfolio exposure</div>{calc.positionPct.toFixed(1)}%</div>
                {[["T1", calc.target1], ["T2", calc.target2]].map(([n, t]) => t && (
                  <div key={n}><div className="text-[11px] uppercase text-slate-400">{n} gain · R:R</div><span className="text-emerald-600">{fmt.money(t.gain)}</span> · {t.rr.toFixed(2)} : 1</div>
                ))}
              </div>
              {calc.cappedByPositionLimit && <p className="text-xs text-amber-700 mt-3">Size reduced by your position limit (risk alone would allow {calc.sharesByRisk} shares).</p>}
              <p className="text-[11px] text-slate-400 mt-3">shares = floor(account × risk% ÷ (entry − stop)) = floor({fmt.money(calc.riskCapital)} ÷ {fmt.money(calc.riskPerShare)}). Calculated deterministically on the server; no AI involved.</p>
              <button onClick={save} disabled={saved} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-60"><Save className="w-4 h-4" /> {saved ? "Plan saved" : "Save trade plan"}</button>
            </>)}
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 p-5"><h2 className="font-semibold text-slate-700 mb-3">Risk / reward</h2>
              <Ladder entry={num(plan.entry)} stop={num(plan.stop)} t1={num(plan.target1)} t2={num(plan.target2)} /></div>
            <div className="md:col-span-2 bg-white rounded-2xl ring-1 ring-slate-200/70 p-4">
              {inst && <CandlestickChart candles={inst.candles} series={inst.indicators.series} height={300} levels={[
                { price: num(plan.entry), color: "#2563eb", title: "Entry" }, { price: num(plan.stop), color: "#e11d48", title: "Stop" },
                { price: num(plan.target1), color: "#059669", title: "T1" }, { price: num(plan.target2), color: "#10b981", title: "T2" }]} />}
              {!inst && !nc && <p className="text-sm text-slate-400 p-8 text-center">Loading chart…</p>}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6 text-[11px] text-slate-400 max-w-2xl">Position sizing is arithmetic on the inputs above, not advice. Stops do not guarantee a fill at the stop price. No trade is executed by this app.</p>
    </div>
  );
}
