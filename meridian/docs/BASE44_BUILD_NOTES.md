# Meridian (TradeLogic Terminal) — Base44 build notes

Summarised from the Base44 chat history. Product rule throughout: never fabricate prices, indicators,
news, win rates or projections; show "Data unavailable" instead. Research/decision support only, no trade execution.

Workflow: SCAN → ANALYZE → RESEARCH → RISK → PLAN → MONITOR.

## Built in Base44
- Shell: dark sidebar, light content, mobile nav. Routes: Dashboard, Scan, `/analyze/:symbol`, `/research/:symbol`, `/risk/:symbol`, Watchlist, Settings, auth + OAuth consent.
- Scanner: universes (S&P 500 core 38, Nasdaq core 30, major ETFs 25), server-side Twelve Data OHLCV, deterministic EMA/SMA/RSI/MACD/ATR/volatility/relative strength, setup types, statuses (READY/WATCH/EARLY/EXTENDED/RISKY/AVOID/NO SETUP), explainable 0-100 score (Technical 35, Momentum 20, Fundamentals 15, Catalysts 10, Risk/Reward 20).
- Analyze: candlestick chart + EMA20/50/SMA200, ranges 1D-5Y, indicators, thesis from calculated data only, symbol search, 52-week range panel, candlestick analyzer (block scan with 1/5/10-bar bias, historical reliability backtest over loaded bars, pattern library), NVIDIA NIM AI analysis (server-side, model list tried in order because NIM retires models).
- Research: Twelve Data `/statistics` + `/profile` fundamentals, reported earnings with surprise, web-search LLM pass for sourced news/catalysts and upcoming earnings + volatility note. Forward earnings calendar is a paid Twelve Data endpoint.
- Risk Manager: shares = account x risk% / (entry - stop), max-position cap, T1/T2 R:R, risk/reward ladder, saved TradePlan, stop/target overlay on the candlestick chart.
- Watchlist: ranks symbols, "Best Buy for the Day", BUY/SELL/HOLD/WAIT badge, expected-move visual, entry/exit levels, `checkWatchlistAlerts` (manual trigger, 24h de-dupe).
- MCP: OAuth mode exposing the six functions plus entity read/write.

## Secrets (kept in Base44, not in this repo)
`TWELVE_DATA_API_KEY`, `NVIDIA_NIM_API_KEY`

## Base44 backend functions
`runScan`, `fetchInstrumentData`, `analyzeWatchlist`, `fetchResearch`, `aiAnalysis`, `checkWatchlistAlerts`, provider status.

## Entities
Instrument, Setup, ScanRun, Watchlist, TradePlan, Alert.

## Not built yet
Trade Plans page, Monitor, Backtests, ETF-specific research, scheduled alerts (needs Base44 Builder+ workflow).
