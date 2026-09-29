# Meridian — market research terminal (Vite + React)

Rebuild of the Base44 "TradeLogic Terminal" app on top of this repo's Flask server.
Workflow: SCAN → ANALYZE → RESEARCH → RISK → PLAN → MONITOR. Research and decision support only;
nothing is executed, and unavailable data is shown as "Data unavailable" rather than estimated.

## Run

```bash
# API (keys stay server-side)
cd server
pip install -r requirements.txt
export TWELVEDATA_API_KEY=...        # market data + fundamentals
export NVIDIA_NIM_API_KEY=...        # optional, AI explanation
export NVIDIA_NIM_MODELS=meta/llama-3.3-70b-instruct,deepseek-ai/deepseek-v3.1   # optional, tried in order
python app.py                        # http://localhost:5055

# UI
cd meridian
npm install
npm run dev                          # http://localhost:5173, /api is proxied to :5055
```

Set `VITE_API_BASE` at build time to point the UI at a deployed API, and `CORS_ORIGINS` on the server.

## Where things are
- `server/engine.py` — pure indicator (EMA/SMA/RSI/MACD/ATR/volatility), setup detection, 0-100 score, status and position-sizing math.
- `server/meridian_api.py` — `/api/meridian/*` endpoints: status, universes, instrument, scan, watchlist/analyze, research, risk, ai. Candle cache: 10 min.
- `server/tests/` — `pytest` unit tests (RSI checked against Wilder's worked example, spec position-size example, API tests with fake candles).
- `src/pages/` — Dashboard, Scan, Analyze, Research, Risk, Watchlist, Settings. `src/lib/patterns.js` — candlestick detection.
- `reference/base44/` — the original Base44 `Analyze.jsx` / `Dashboard.jsx` for comparison (they do not build here).

## Differences from the Base44 app
- Watchlist, saved plans, last scan and risk settings live in browser localStorage (no accounts or database).
- Scoring rules and thresholds are re-implemented from the spec, so scores will not match Base44 exactly. Fundamentals and Catalysts are not scored, so the maximum reachable score is 75.
- News, catalysts and upcoming-earnings dates are shown as unavailable: no licensed news provider is wired in (Base44 used a web-search LLM).
- Level alerts are evaluated when you run "Analyze Watchlist" (end-of-day close), not pushed.
- Not built yet: Trade Plans page, Monitor, Backtests, ETF-specific research, scheduled alerts.
