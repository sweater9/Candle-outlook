import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Activity, LayoutDashboard, ScanLine, LineChart, Microscope, ShieldAlert, Star, Settings, Menu, X } from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/scan", label: "Market Scan", icon: ScanLine },
  { to: "/analyze/SPY", label: "Analyze", icon: LineChart },
  { to: "/research/AAPL", label: "Research", icon: Microscope },
  { to: "/risk/AAPL", label: "Risk Manager", icon: ShieldAlert },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Links({ onClick }) {
  return NAV.map(({ to, label, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} onClick={onClick}
      className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"}`}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} /> {label}
    </NavLink>
  ));
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center">
        <Activity className="w-4 h-4 text-[#0b1220]" strokeWidth={2.5} />
      </div>
      <span className="font-semibold tracking-tight text-white">Meridian</span>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[#0b1220] p-4 sticky top-0 h-screen">
        <div className="px-2 py-3 mb-4"><Brand /></div>
        <nav className="space-y-1 flex-1"><Links /></nav>
        <p className="text-[10px] text-slate-500 leading-relaxed px-2">Research &amp; decision support only. Not investment advice.</p>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="md:hidden sticky top-0 z-40 bg-[#0b1220] flex items-center justify-between px-4 h-14">
          <Brand />
          <button onClick={() => setOpen(!open)} className="p-2 -mr-2 text-white" aria-label="Menu">{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
        {open && <div className="md:hidden bg-[#0b1220] p-3 space-y-1 sticky top-14 z-30"><Links onClick={() => setOpen(false)} /></div>}
        <main><Outlet /></main>
      </div>
    </div>
  );
}
