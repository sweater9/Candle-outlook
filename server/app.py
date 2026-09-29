"""
Candle Outlook — market-data candle proxy.

Keeps Twelve Data + Alpaca API keys server-side; yfinance needs no key.
The static GitHub Pages site calls GET /api/candles; secrets never ship to the browser.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from functools import wraps
from typing import Any

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)

_cors = os.environ.get("CORS_ORIGINS", "*").strip()
if _cors == "*":
    CORS(app)
else:
    CORS(app, origins=[o.strip() for o in _cors.split(",") if o.strip()])

TWELVEDATA_API_KEY = os.environ.get("TWELVEDATA_API_KEY", "").strip()
ALPACA_API_KEY = os.environ.get("ALPACA_API_KEY", "").strip()
ALPACA_API_SECRET = os.environ.get("ALPACA_API_SECRET", "").strip()
ALPACA_BASE_URL = os.environ.get("ALPACA_BASE_URL", "https://data.alpaca.markets").rstrip("/")

# Simple in-process rate limiting (per IP)
_RATE: dict[str, list[float]] = {}
_RATE_WINDOW = 60.0
_RATE_MAX = 45


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        ip = _client_ip()
        now = time.time()
        bucket = [t for t in _RATE.get(ip, []) if now - t < _RATE_WINDOW]
        if len(bucket) >= _RATE_MAX:
            return jsonify({"error": "rate_limited", "message": "Too many requests; retry shortly."}), 429
        bucket.append(now)
        _RATE[ip] = bucket
        return fn(*args, **kwargs)

    return wrapper


# Terminal TF labels → provider intervals
INTERVAL_MAP = {
    # yfinance: native interval; optional aggregate_n builds higher TF (e.g. 4h from 1h)
    "1m": {"twelvedata": "1min", "alpaca": "1Min", "yfinance": "1m", "yf_period": "7d"},
    "1min": {"twelvedata": "1min", "alpaca": "1Min", "yfinance": "1m", "yf_period": "7d"},
    "5m": {"twelvedata": "5min", "alpaca": "5Min", "yfinance": "5m", "yf_period": "60d"},
    "5min": {"twelvedata": "5min", "alpaca": "5Min", "yfinance": "5m", "yf_period": "60d"},
    "15m": {"twelvedata": "15min", "alpaca": "15Min", "yfinance": "15m", "yf_period": "60d"},
    "15min": {"twelvedata": "15min", "alpaca": "15Min", "yfinance": "15m", "yf_period": "60d"},
    "30m": {"twelvedata": "30min", "alpaca": "30Min", "yfinance": "30m", "yf_period": "60d"},
    "1h": {"twelvedata": "1h", "alpaca": "1Hour", "yfinance": "1h", "yf_period": "730d"},
    "60m": {"twelvedata": "1h", "alpaca": "1Hour", "yfinance": "1h", "yf_period": "730d"},
    "4h": {"twelvedata": "4h", "alpaca": "4Hour", "yfinance": "1h", "yf_period": "730d", "yf_aggregate": 4},
    "1d": {"twelvedata": "1day", "alpaca": "1Day", "yfinance": "1d", "yf_period": "2y"},
    "1D": {"twelvedata": "1day", "alpaca": "1Day", "yfinance": "1d", "yf_period": "2y"},
    "1day": {"twelvedata": "1day", "alpaca": "1Day", "yfinance": "1d", "yf_period": "2y"},
    "1w": {"twelvedata": "1week", "alpaca": "1Week", "yfinance": "1wk", "yf_period": "5y"},
    "1W": {"twelvedata": "1week", "alpaca": "1Week", "yfinance": "1wk", "yf_period": "5y"},
    "1week": {"twelvedata": "1week", "alpaca": "1Week", "yfinance": "1wk", "yf_period": "5y"},
}


def normalize_interval(raw: str) -> str:
    key = (raw or "1D").strip()
    if key in INTERVAL_MAP:
        return key
    low = key.lower()
    for k in INTERVAL_MAP:
        if k.lower() == low:
            return k
    return "1D"


US_EQUITY_RE = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")
CRYPTO_HINT = re.compile(r"(USD|USDT|BTC|ETH|/)", re.I)
FOREX_HINT = re.compile(r"^[A-Z]{3}/[A-Z]{3}$|^[A-Z]{6}$")


def looks_like_us_equity(symbol: str) -> bool:
    s = symbol.upper().strip()
    if CRYPTO_HINT.search(s) and "-" in s:
        return False
    if FOREX_HINT.match(s):
        return False
    if s.endswith("USDT") or s.endswith("-USD"):
        return False
    return bool(US_EQUITY_RE.match(s))


def _iso(ts: Any) -> str:
    if ts is None:
        return ""
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    text = str(ts).strip()
    if not text:
        return ""
    # Alpaca RFC3339 / Twelve Data "YYYY-MM-DD HH:MM:SS"
    try:
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        if " " in text:
            return datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
        return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        return text


def _candle(time_iso: str, o: Any, h: Any, l: Any, c: Any, v: Any = 0) -> dict | None:
    try:
        open_, high, low, close = float(o), float(h), float(l), float(c)
        volume = float(v or 0)
    except (TypeError, ValueError):
        return None
    if not all(map(lambda x: x == x and abs(x) != float("inf"), [open_, high, low, close])):
        return None
    return {
        "time": time_iso,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    }


def fetch_twelvedata(symbol: str, interval_key: str, limit: int) -> dict:
    if not TWELVEDATA_API_KEY:
        raise RuntimeError("TWELVEDATA_API_KEY is not configured")
    td_interval = INTERVAL_MAP[interval_key]["twelvedata"]
    # Twelve Data free tiers often cap outputsize; request what we need.
    outputsize = max(1, min(int(limit), 5000))
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": symbol,
        "interval": td_interval,
        "outputsize": outputsize,
        "apikey": TWELVEDATA_API_KEY,
        "order": "ASC",
        "timezone": "UTC",
    }
    r = requests.get(url, params=params, timeout=25)
    data = r.json() if r.content else {}
    if r.status_code != 200 or data.get("status") == "error":
        msg = data.get("message") or data.get("status") or f"HTTP {r.status_code}"
        raise RuntimeError(f"Twelve Data: {msg}")
    values = data.get("values") or []
    candles = []
    for row in values:
        c = _candle(row.get("datetime"), row.get("open"), row.get("high"), row.get("low"), row.get("close"), row.get("volume"))
        if c:
            candles.append(c)
    candles.sort(key=lambda x: x["time"])
    if limit and len(candles) > limit:
        candles = candles[-limit:]
    if not candles:
        raise RuntimeError("Twelve Data returned no candles")
    return {"provider": "twelvedata", "symbol": symbol, "interval": interval_key, "candles": candles}


def fetch_alpaca(symbol: str, interval_key: str, limit: int) -> dict:
    if not ALPACA_API_KEY or not ALPACA_API_SECRET:
        raise RuntimeError("ALPACA_API_KEY / ALPACA_API_SECRET are not configured")
    tf = INTERVAL_MAP[interval_key]["alpaca"]
    # Prefer multi-symbol bars endpoint; fall back to single-symbol path.
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
        "Accept": "application/json",
    }
    params = {
        "symbols": symbol.upper(),
        "timeframe": tf,
        "limit": max(1, min(int(limit), 10000)),
        "adjustment": "raw",
        "feed": "iex",
        "sort": "asc",
    }
    url = f"{ALPACA_BASE_URL}/v2/stocks/bars"
    r = requests.get(url, headers=headers, params=params, timeout=25)
    if r.status_code == 404 or (r.status_code == 400 and "feed" in (r.text or "").lower()):
        # Retry without feed / with single-symbol path
        params.pop("feed", None)
        r = requests.get(url, headers=headers, params=params, timeout=25)
    if r.status_code >= 400:
        # Single-symbol legacy path
        url2 = f"{ALPACA_BASE_URL}/v2/stocks/{symbol.upper()}/bars"
        params2 = {
            "timeframe": tf,
            "limit": max(1, min(int(limit), 10000)),
            "adjustment": "raw",
            "feed": "iex",
            "sort": "asc",
        }
        r = requests.get(url2, headers=headers, params=params2, timeout=25)
        if r.status_code >= 400:
            try:
                err = r.json()
                msg = err.get("message") or err.get("error") or r.text[:200]
            except Exception:
                msg = r.text[:200] or f"HTTP {r.status_code}"
            raise RuntimeError(f"Alpaca: {msg}")
        data = r.json() if r.content else {}
        bars = data.get("bars") or []
    else:
        data = r.json() if r.content else {}
        bars_obj = data.get("bars") or {}
        if isinstance(bars_obj, dict):
            bars = bars_obj.get(symbol.upper()) or bars_obj.get(symbol) or []
        else:
            bars = bars_obj

    candles = []
    for row in bars:
        c = _candle(row.get("t"), row.get("o"), row.get("h"), row.get("l"), row.get("c"), row.get("v"))
        if c:
            candles.append(c)
    candles.sort(key=lambda x: x["time"])
    if limit and len(candles) > limit:
        candles = candles[-limit:]
    if not candles:
        raise RuntimeError("Alpaca returned no candles")
    return {"provider": "alpaca", "symbol": symbol, "interval": interval_key, "candles": candles}



def _yf_available() -> bool:
    try:
        import yfinance  # noqa: F401

        return True
    except ImportError:
        return False


def _yahoo_symbol(symbol: str) -> str:
    """Map common terminal tickers onto Yahoo Finance symbols."""
    s = symbol.strip().upper()
    # EURUSD / EUR/USD → EURUSD=X
    if "/" in s and len(s.replace("/", "")) == 6:
        return s.replace("/", "") + "=X"
    if len(s) == 6 and s.isalpha() and not looks_like_us_equity(s) and FOREX_HINT.match(s):
        return s + "=X"
    return s


def _aggregate_candles(candles: list[dict], n: int) -> list[dict]:
    if n <= 1:
        return candles
    out: list[dict] = []
    for i in range(0, len(candles), n):
        chunk = candles[i : i + n]
        if not chunk:
            continue
        out.append(
            {
                "time": chunk[0]["time"],
                "open": chunk[0]["open"],
                "high": max(c["high"] for c in chunk),
                "low": min(c["low"] for c in chunk),
                "close": chunk[-1]["close"],
                "volume": sum(c.get("volume") or 0 for c in chunk),
            }
        )
    return out


def fetch_yfinance(symbol: str, interval_key: str, limit: int) -> dict:
    try:
        import yfinance as yf
    except ImportError as e:
        raise RuntimeError("yfinance is not installed on the proxy") from e

    meta = INTERVAL_MAP[interval_key]
    yf_interval = meta["yfinance"]
    period = meta.get("yf_period") or "1y"
    ysym = _yahoo_symbol(symbol)
    # Request extra bars when we will aggregate (4h from 1h)
    agg = int(meta.get("yf_aggregate") or 1)
    pull = max(int(limit) * max(agg, 1), int(limit))
    # Cap history call size; yfinance period is the hard limit for intraday
    ticker = yf.Ticker(ysym)
    try:
        df = ticker.history(period=period, interval=yf_interval, auto_adjust=False, actions=False)
    except Exception as e:
        raise RuntimeError(f"yfinance: {e}") from e
    if df is None or getattr(df, "empty", True):
        raise RuntimeError(f"yfinance returned no candles for {ysym}")

    candles: list[dict] = []
    for idx, row in df.iterrows():
        try:
            if hasattr(idx, "to_pydatetime"):
                ts = idx.to_pydatetime()
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                else:
                    ts = ts.astimezone(timezone.utc)
                time_iso = ts.isoformat()
            else:
                time_iso = _iso(idx)
            c = _candle(time_iso, row.get("Open"), row.get("High"), row.get("Low"), row.get("Close"), row.get("Volume"))
            if c:
                candles.append(c)
        except Exception:
            continue
    candles.sort(key=lambda x: x["time"])
    if agg > 1:
        candles = _aggregate_candles(candles, agg)
    if limit and len(candles) > limit:
        candles = candles[-limit:]
    if not candles:
        raise RuntimeError(f"yfinance returned no usable OHLC for {ysym}")
    return {"provider": "yfinance", "symbol": symbol, "interval": interval_key, "candles": candles}


@app.get("/")
def index():
    """Tiny landing so the service URL is useful in a browser."""
    wants_json = "application/json" in (request.headers.get("Accept") or "")
    body = {
        "service": "candle-outlook-proxy",
        "ok": True,
        "endpoints": {
            "health": "/api/health",
            "candles": "/api/candles?symbol=AAPL&interval=1D&provider=auto&limit=100",
        },
        "providers": ["auto", "twelvedata", "alpaca", "yfinance"],
        "intervals": sorted({k for k in INTERVAL_MAP if len(k) <= 3 or k in {"1min", "5min", "15min", "1day", "1week"}}),
        "note": "Point the terminal at this origin with ?api=<this-host> (no path).",
    }
    if wants_json:
        return jsonify(body)
    html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Candle Outlook proxy</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;font:14px/1.45 system-ui,sans-serif;background:#0b0f14;color:#d7dee7}
  main{max-width:640px;margin:48px auto;padding:0 20px}
  h1{font-size:20px;font-weight:650;margin:0 0 8px}
  p{color:#8b98a8;margin:0 0 18px}
  code,a{color:#9ec1ff}
  a{text-decoration:none}
  a:hover{text-decoration:underline}
  ul{padding-left:18px;margin:0 0 18px}
  li{margin:8px 0}
  .chip{display:inline-block;padding:2px 8px;border:1px solid #2a3644;border-radius:999px;color:#a9b6c4;font-size:12px;margin-right:6px}
</style>
</head>
<body>
<main>
  <h1>Candle Outlook proxy</h1>
  <p>Market-data API for the terminal. Keys stay server-side.</p>
  <ul>
    <li><a href="/api/health"><code>/api/health</code></a> — providers + status</li>
    <li><a href="/api/candles?symbol=AAPL&amp;interval=1D&amp;provider=auto&amp;limit=100"><code>/api/candles?symbol=AAPL&amp;interval=1D&amp;provider=auto&amp;limit=100</code></a></li>
  </ul>
  <p>
    <span class="chip">auto</span>
    <span class="chip">twelvedata</span>
    <span class="chip">alpaca</span>
    <span class="chip">yfinance</span>
  </p>
  <p>Terminal tip: open with <code>?api=https://candle-outlook-proxy.onrender.com</code> (origin only, no path).</p>
</main>
</body>
</html>"""
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "candle-outlook-proxy",
            "providers": {
                "twelvedata": bool(TWELVEDATA_API_KEY),
                "alpaca": bool(ALPACA_API_KEY and ALPACA_API_SECRET),
                "yfinance": _yf_available(),
            },
        }
    )


@app.get("/api/candles")
@rate_limit
def candles():
    symbol = (request.args.get("symbol") or "").strip().upper()
    if not symbol:
        return jsonify({"error": "bad_request", "message": "symbol is required"}), 400
    interval_key = normalize_interval(request.args.get("interval") or "1D")
    if interval_key not in INTERVAL_MAP:
        return jsonify({"error": "bad_request", "message": f"unsupported interval: {interval_key}"}), 400
    try:
        limit = int(request.args.get("limit") or 500)
    except ValueError:
        return jsonify({"error": "bad_request", "message": "limit must be an integer"}), 400
    limit = max(1, min(limit, 5000))
    provider = (request.args.get("provider") or "auto").strip().lower()
    if provider not in {"auto", "twelvedata", "alpaca", "yfinance"}:
        return jsonify({"error": "bad_request", "message": "provider must be auto|twelvedata|alpaca|yfinance"}), 400

    errors: list[str] = []

    def try_alpaca():
        return fetch_alpaca(symbol, interval_key, limit)

    def try_td():
        return fetch_twelvedata(symbol, interval_key, limit)

    def try_yf():
        return fetch_yfinance(symbol, interval_key, limit)

    try:
        if provider == "alpaca":
            return jsonify(try_alpaca())
        if provider == "twelvedata":
            return jsonify(try_td())
        if provider == "yfinance":
            return jsonify(try_yf())

        # auto: US equities → Alpaca, then Twelve Data, then keyless yfinance
        if looks_like_us_equity(symbol) and ALPACA_API_KEY and ALPACA_API_SECRET:
            try:
                return jsonify(try_alpaca())
            except Exception as e:
                errors.append(str(e))
        if TWELVEDATA_API_KEY:
            try:
                return jsonify(try_td())
            except Exception as e:
                errors.append(str(e))
        if ALPACA_API_KEY and ALPACA_API_SECRET and "Alpaca" not in "".join(errors):
            try:
                return jsonify(try_alpaca())
            except Exception as e2:
                errors.append(str(e2))
        if _yf_available():
            try:
                return jsonify(try_yf())
            except Exception as e3:
                errors.append(str(e3))
        return jsonify({"error": "upstream_failed", "message": "; ".join(errors) or "No provider succeeded"}), 502
    except Exception as e:
        return jsonify({"error": "upstream_failed", "message": str(e)}), 502


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not_found", "message": "Unknown route"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5055"))
    app.run(host="0.0.0.0", port=port, debug=False)
