import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Scan from "@/pages/Scan";
import Analyze from "@/pages/Analyze";
import Research from "@/pages/Research";
import Risk from "@/pages/Risk";
import Watchlist from "@/pages/Watchlist";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="scan" element={<Scan />} />
        <Route path="analyze/:symbol" element={<Analyze />} />
        <Route path="research/:symbol" element={<Research />} />
        <Route path="risk/:symbol" element={<Risk />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<div className="p-8 text-slate-500">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
