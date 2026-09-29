// Browser-local persistence (no accounts / database yet).
import { useEffect, useState } from "react";

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function useStored(key, fallback) {
  const [value, setValue] = useState(() => read("meridian:" + key, fallback));
  useEffect(() => { write("meridian:" + key, value); }, [key, value]);
  return [value, setValue];
}
export const getStored = (key, fallback) => read("meridian:" + key, fallback);
export const setStored = (key, value) => write("meridian:" + key, value);

export const fmt = {
  money: (v, d = 2) => (v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })),
  num: (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d)),
  pct: (v, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(d)}%`),
  big: (v) => {
    if (v == null) return "—";
    const a = Math.abs(v);
    return a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v.toFixed(2);
  },
};
