"""
Candle Outlook — market-data candle proxy.

Keeps Twelve Data + Alpaca API keys server-side. The static GitHub Pages
site calls GET /api/candles; keys never ship to the browser.
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
    "1m": {"twelvedata": "1min", "alpaca": "1Min"},
    "1min": {"twelvedata": "1min", "alpaca": "1Min"},
    "5m": {"twelvedata": "5min", "alpaca": "5Min"},
    "5min": {"twelvedata": "5min", "alpaca": "5Min"},
    "15m": {"twelvedata": "15min", "alpaca": "15Min"},
    "15min": {"twelvedata": "15min", "alpaca": "15Min"},
    "30m": {"twelvedata": "30min", "alpaca": "30Min"},
    "1h": {"twelvedata": "1h", "alpaca": "1Hour"},
    "60m": {"twelvedata": "1h", "alpaca": "1Hour"},
    "4h": {"twelvedata": "4h", "alpaca": "4Hour"},
    "1d": {"twelvedata": "1day", "alpaca": "1Day"},
    "1D": {"twelvedata": "1day", "alpaca": "1Day"},
    "1day": {"twelvedata": "1day", "alpaca": "1Day"},
    "1w": {"twelvedata": "1week", "alpaca": "1Week"},
    "1W": {"twelvedata": "1week", "alpaca": "1Week"},
    "1week": {"twelvedata": "1week", "alpaca": "1Week"},
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


@app.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "candle-outlook-proxy",
            "providers": {
                "twelvedata": bool(TWELVEDATA_API_KEY),
                "alpaca": bool(ALPACA_API_KEY and ALPACA_API_SECRET),
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
    if provider not in {"auto", "twelvedata", "alpaca"}:
        return jsonify({"error": "bad_request", "message": "provider must be auto|twelvedata|alpaca"}), 400

    errors: list[str] = []

    def try_alpaca():
        return fetch_alpaca(symbol, interval_key, limit)

    def try_td():
        return fetch_twelvedata(symbol, interval_key, limit)

    try:
        if provider == "alpaca":
            return jsonify(try_alpaca())
        if provider == "twelvedata":
            return jsonify(try_td())

        # auto: US equities/ETFs → Alpaca first, else Twelve Data
        if looks_like_us_equity(symbol) and ALPACA_API_KEY and ALPACA_API_SECRET:
            try:
                return jsonify(try_alpaca())
            except Exception as e:
                errors.append(str(e))
        try:
            return jsonify(try_td())
        except Exception as e:
            errors.append(str(e))
            # last resort: Alpaca even for non-equity if configured
            if ALPACA_API_KEY and ALPACA_API_SECRET and "Alpaca" not in "".join(errors):
                try:
                    return jsonify(try_alpaca())
                except Exception as e2:
                    errors.append(str(e2))
        return jsonify({"error": "upstream_failed", "message": "; ".join(errors) or "No provider succeeded"}), 502
    except Exception as e:
        return jsonify({"error": "upstream_failed", "message": str(e)}), 502


import meridian_api  # noqa: E402

meridian_api.init(fetch_twelvedata)
app.register_blueprint(meridian_api.bp)


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not_found", "message": "Unknown route"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5055"))
    app.run(host="0.0.0.0", port=port, debug=False)
