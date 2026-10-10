"""Indian API adapter: quotes and price history, never synthetic OHLC.

Free-plan origin is fixed. The key is sent only in X-API-Key, never a URL.
"""
import math
import re
import time
import threading
from datetime import datetime, timezone
import requests


class IndianError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(str(value).replace(",", "").rstrip("%"))
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def stock_query(name, exchange):
    name = (name or "").strip()
    exchange = (exchange or "NSE").upper()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 .&()'-]{0,79}", name):
        raise IndianError("Enter a company name or Indian stock symbol (up to 80 characters).", 400)
    if exchange not in {"NSE", "BSE"}:
        raise IndianError("Choose NSE or BSE.", 400)
    return name, exchange


def normalize_quote(data, name, exchange):
    if not isinstance(data, dict) or not data.get("companyName"):
        raise IndianError("No matching company returned. Try its full company name.", 404)
    prices = data.get("currentPrice") or {}
    price = number(prices.get(exchange)) if isinstance(prices, dict) else None
    if price is None or price <= 0:
        raise IndianError(f"No {exchange} price returned for this company.", 404)
    change = data.get("percentChange")
    # A scalar percentChange is not documented as exchange-specific.
    change = number(change.get(exchange)) if isinstance(change, dict) else None
    return {"symbol": str(data.get("tickerId") or name), "company": str(data["companyName"]),
            "exchange": exchange, "currency": "INR", "price": price, "change": change,
            "industry": str(data.get("industry") or ""),
            "source_time": str(data.get("lastUpdated") or data.get("dataTimestamp") or "") or None,
            "delay": "Unknown; provider snapshot, not a tick stream"}


def normalize_history(data, exchange):
    datasets = data.get("datasets", []) if isinstance(data, dict) else []
    price = next((d for d in datasets if isinstance(d, dict) and d.get("metric") == "Price"
                  and exchange in str(d.get("label", "")).upper()), None)
    if not price:
        raise IndianError(f"No {exchange} price history returned. Quotes remain available.")
    points = []
    seen = set()
    for row in price.get("values") or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        try:
            date = datetime.strptime(str(row[0]), "%Y-%m-%d").date().isoformat()
        except ValueError:
            continue
        value = number(row[1])
        if value is not None and value > 0 and date not in seen:
            seen.add(date)
            points.append({"date": date, "price": value})
    points.sort(key=lambda p: p["date"])
    if len(points) < 2:
        raise IndianError("Insufficient valid price history. Quotes remain available.")
    return {"points": points[-500:], "is_weekly": bool((price.get("meta") or {}).get("is_weekly")),
            "label": str(price.get("label", "Price")), "kind": "price-series"}


class IndianClient:
    def __init__(self, key, transport=requests.get):
        self.key = key
        self.transport = transport
        self.cache = {}
        self.lock = threading.RLock()
        self.last_request = 0
        self.month = ""
        self.day = ""
        self.month_calls = 0
        self.day_calls = 0

    def usage(self):
        now = datetime.now(timezone.utc)
        if self.month != now.strftime("%Y-%m"):
            self.month, self.month_calls = now.strftime("%Y-%m"), 0
        if self.day != now.strftime("%Y-%m-%d"):
            self.day, self.day_calls = now.strftime("%Y-%m-%d"), 0
        return {"calls_this_process_month": self.month_calls, "calls_this_process_day": self.day_calls,
                "daily_limit": 12, "monthly_limit": 450,
                "note": "Proxy counters reset on restart. Check Indian API dashboard for account usage."}

    def _request(self, path, params, ttl):
        if not self.key:
            raise IndianError("INDIANAPI_API_KEY is not configured on the proxy.", 503)
        key = (path, tuple(sorted(params.items())))
        with self.lock:
            cached = self.cache.get(key)
            if cached and time.time() - cached[0] < ttl:
                return cached[1], cached[0], True
            usage = self.usage()
            if self.month_calls >= usage["monthly_limit"] or self.day_calls >= usage["daily_limit"]:
                raise IndianError("Indian API proxy request budget reached. Cached stocks remain available; check usage before tomorrow's requests.", 429)
            pause = max(0, 1.1 - (time.monotonic() - self.last_request))
            if pause:
                time.sleep(pause)
            self.last_request = time.monotonic()
            self.month_calls += 1
            self.day_calls += 1
            try:
                response = self.transport("https://stock.indianapi.in" + path, params=params,
                                          headers={"X-API-Key": self.key, "Accept": "application/json"}, timeout=25)
                data = response.json()
            except (requests.RequestException, ValueError):
                raise IndianError("Indian API connection failed. Try again later.") from None
            if response.status_code in {401, 403}:
                raise IndianError("Indian API rejected access. Check the Render key and your plan's endpoint access.", 502)
            if response.status_code == 429:
                raise IndianError("Indian API quota or rate limit reached. Check your provider dashboard.", 429)
            if response.status_code != 200 or not isinstance(data, dict) or data.get("error") or data.get("detail"):
                raise IndianError("Indian API could not return this stock. Check its name and plan access.")
            fetched = time.time()
            # Bound cache memory; quota already caps uncached requests.
            if len(self.cache) >= 500:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = (fetched, data)
            return data, fetched, False

    def stock(self, name, exchange="NSE", history=False):
        name, exchange = stock_query(name, exchange)
        data, fetched, cached = self._request("/stock", {"name": name.upper()}, 3600)
        quote = normalize_quote(data, name, exchange)
        output = {"provider": "indianapi", "quote": quote,
                  "fetched_at": datetime.fromtimestamp(fetched, timezone.utc).isoformat(),
                  "cached": cached, "history": None}
        if history:
            try:
                payload, history_at, history_cached = self._request("/historical_data",
                    {"stock_name": name.upper(), "period": "1yr", "filter": "price"}, 86400)
                output["history"] = normalize_history(payload, exchange)
                output["history_fetched_at"] = datetime.fromtimestamp(history_at, timezone.utc).isoformat()
                output["history_cached"] = history_cached
            except IndianError as error:
                output["history_error"] = str(error)
        output["usage"] = self.usage()
        return output
