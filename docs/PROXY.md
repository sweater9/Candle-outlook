# Live candle proxy (Twelve Data + Alpaca)

API keys must **never** ship in the static GitHub Pages site or frontend JS. Run the Flask proxy locally (or on Render) and point the terminal at it.

## Env vars

| Variable | Purpose |
|---|---|
| `TWELVEDATA_API_KEY` | Twelve Data time-series |
| `ALPACA_API_KEY` | Alpaca key id (market data) |
| `ALPACA_API_SECRET` | Alpaca secret |
| `ALPACA_BASE_URL` | Optional, default `https://data.alpaca.markets` |
| `PORT` | Optional, default `5055` |
| `CORS_ORIGINS` | Optional, default `*` |

Copy `server/.env.example` → `server/.env`. Do not commit `.env`.

## Run locally

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TWELVEDATA_API_KEY=...
export ALPACA_API_KEY=...
export ALPACA_API_SECRET=...
python app.py
# → http://localhost:5055
```

- `GET /api/health`
- `GET /api/candles?symbol=AAPL&interval=5m&provider=auto|twelvedata|alpaca&limit=500`

`provider=auto` tries Alpaca for US equities/ETFs, then Twelve Data.

## Terminal wiring

Open `terminal.html`. Proxy base defaults to `http://localhost:5055`.

- Override with `?api=https://your-proxy.example`
- Or the **Candle API** input (saved as `localStorage` key `co-api-base`)

**Send to analysis** stores OHLC under `co-live-candles` and opens `index.html`.

## Render

See `render.yaml`. Set the three API env vars in the Render dashboard.
