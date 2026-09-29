# Meridian source (from Base44 export)

`src/pages/Analyze.jsx` is the original Base44 page component. It imports
`@/api/base44Client`, `@/components/*` (CandlestickChart, StatusBadge, ScoreBadge,
FiftyTwoWeekRange, CandlestickAnalyzer, DataStatus, EmptyState) and the backend functions
`fetchInstrumentData` / `aiAnalysis`, none of which are in this repo yet, so it is stored for
reference and does not build here. `../meridian.html` is the runnable static snapshot.

`src/pages/Dashboard.jsx` is the dashboard page. It also needs the `Setup`, `ScanRun`,
`Watchlist` and `TradePlan` entities.
