// Thin client for the Flask API (server/meridian_api.py). All provider keys live on the server.
const BASE = (import.meta.env.VITE_API_BASE || "") + "/api/meridian";

async function req(path, opts) {
  const res = await fetch(BASE + path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!body) throw new Error(`Request failed (${res.status})`);
  return body;
}
const post = (path, data) =>
  req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const api = {
  status: () => req("/status"),
  universes: () => req("/universes"),
  instrument: (symbol, range = "6M") => req(`/instrument?symbol=${encodeURIComponent(symbol)}&range=${range}`),
  scan: (universe) => post("/scan", { universe }),
  watchlist: (symbols) => post("/watchlist/analyze", { symbols }),
  research: (symbol) => req(`/research?symbol=${encodeURIComponent(symbol)}`),
  risk: (params) => post("/risk", params),
  ai: (symbol) => post("/ai", { symbol }),
};
