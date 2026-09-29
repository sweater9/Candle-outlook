"""Scan universes. Static symbol lists; all market data is fetched live."""

UNIVERSES = {
    "sp500_core": {
        "label": "S&P 500 — Core Large Caps",
        "symbols": "AAPL MSFT NVDA AMZN GOOGL META BRK.B TSLA AVGO JPM LLY V UNH XOM MA COST HD PG JNJ ABBV WMT NFLX BAC CRM ORCL CVX KO MRK AMD PEP TMO ADBE CSCO MCD ABT QCOM DIS INTU CAT".split(),
    },
    "nasdaq_core": {
        "label": "Nasdaq — Core Growth",
        "symbols": "AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO NFLX AMD ADBE COST PEP CSCO QCOM INTU AMAT TXN ISRG BKNG AMGN HON MU LRCX ADI PANW KLAC SNPS CDNS MRVL CRWD".split(),
    },
    "etfs": {
        "label": "Major US ETFs",
        "symbols": "SPY QQQ IWM DIA VTI VOO XLK XLF XLE XLV XLY XLP XLI XLU XLB XLRE XLC SMH GLD SLV TLT HYG EEM EFA VNQ".split(),
    },
}
