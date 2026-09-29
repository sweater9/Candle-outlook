"""
Meridian API blueprint: scan / analyze / watchlist / research / risk / AI.

All provider keys stay server-side (TWELVEDATA_API_KEY, NVIDIA_NIM_API_KEY).
Nothing is fabricated: missing upstream data is returned as null / "unavailable".
"""

from __future__ import annotations

import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

import requests
from flask import Blueprint, jsonify, request

import engine
from universes import UNIVERSES

bp = Blueprint("meridian", __name__, url_prefix="/api/meridian")

TD_KEY = lambda: os.environ.get("TWELVEDATA_API_KEY", "").strip()  # noqa: E731
NIM_KEY = lambda: os.environ.get("NVIDIA_NIM_API_KEY", "").strip()  # noqa: E731
NIM_MODELS = lambda: [m.strip() for m in os.environ.get(  # noqa: E731
    "NVIDIA_NIM_MODELS", "meta/llama-3.3-70b-instruct,deepseek-ai/deepseek-v3.1").split(",") if m.strip()]

_fetch: Callable[[str, str, int], dict] | None = None
_cache: dict[tuple, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
CANDLE_TTL = 600.0
SYMBOL_RE = re.compile(r"^[A-Z0-9.\-]{1,10}$")


def init(fetch_twelvedata: Callable[[str, str, int], dict]) -> None:
    global _fetch
    _fetch = fetch_twelvedata


def _cached_candles(symbol: str, interval: str, limit: int) -> dict:
    key = (symbol, interval, limit)
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CANDLE_TTL:
            return hit[1]
    assert _fetch is not None
    data = _fetch(symbol, interval, limit)
    data["fetchedAt"] = datetime.now(timezone.utc).isoformat()
    with _cache_lock:
        _cache[key] = (now, data)
    return data


def _symbol() -> str | None:
    s = (request.values.get("symbol") or (request.get_json(silent=True) or {}).get("symbol") or "").strip().upper()
    return s if SYMBOL_RE.match(s) else None


def _err(code: str, message: str, http: int = 400):
    return jsonify({"status": code, "message": message}), http


def _daily_analysis(symbol: str) -> dict:
    d = _cached_candles(symbol, "1D", 400)
    a = engine.analyze(symbol, d["candles"])
    a["candles"] = d["candles"]
    a["provider"] = d["provider"]
    a["lastUpdated"] = d["fetchedAt"]
    a["data_status"] = "END_OF_DAY"
    return a


def _summary(a: dict) -> dict:
    ind, st = a["indicators"], a["setup"]
    return {
        "symbol": a["symbol"], "price": ind["lastClose"], "change_pct": ind["pctChange"],
        "setup_type": st["setupType"], "status": st["status"], "score": st["score"],
        "score_breakdown": st["breakdown"], "rr_ratio": st["rrRatio"], "levels": st["levels"],
        "reasons": st["reasons"], "trend": ind["trend"], "rsi": ind["rsi"],
        "support": ind["support"], "resistance": ind["resistance"], "atr": ind["atr"],
    }


def _scan_symbols(symbols: list[str], workers: int = 4) -> tuple[list[dict], list[dict]]:
    ok: list[dict] = []
    failed: list[dict] = []

    def one(sym: str):
        try:
            a = _daily_analysis(sym)
            return (sym, a, None)
        except Exception as e:  # provider error for one symbol must not kill the scan
            return (sym, None, str(e))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for sym, a, e in ex.map(one, symbols):
            if a is None or a.get("status") != "ok":
                failed.append({"symbol": sym, "error": e or (a or {}).get("message", "no data")})
            else:
                ok.append(_summary(a))
    ok.sort(key=lambda r: r["score"], reverse=True)
    return ok, failed


# ------------------------------------------------------------------ routes

@bp.get("/status")
def status():
    return jsonify({"twelvedata": bool(TD_KEY()), "nvidia_nim": bool(NIM_KEY())})


@bp.get("/universes")
def universes():
    return jsonify({k: {"label": v["label"], "count": len(v["symbols"])} for k, v in UNIVERSES.items()})


RANGE_CFG = {  # range -> (interval, bars, overlays?)
    "1D": ("5min", 78, False), "5D": ("30min", 65, False),
    "1M": ("1D", 22, True), "3M": ("1D", 66, True), "6M": ("1D", 132, True),
    "1Y": ("1D", 252, True), "5Y": ("1W", 260, False),
}


@bp.get("/instrument")
def instrument():
    sym = _symbol()
    if not sym:
        return _err("bad_request", "A valid symbol is required.")
    rng = (request.args.get("range") or "6M").upper()
    if rng not in RANGE_CFG:
        return _err("bad_request", f"range must be one of {', '.join(RANGE_CFG)}")
    if not TD_KEY():
        return jsonify({"status": "not_configured", "message": "TWELVEDATA_API_KEY is not set on the server."})
    try:
        a = _daily_analysis(sym)
        if a["status"] != "ok":
            return jsonify(a)
        interval, bars, overlays = RANGE_CFG[rng]
        if interval == "1D":
            candles = a["candles"][-bars:]
            series = {k: v[-bars:] for k, v in a["indicators"]["series"].items()} if overlays else None
        else:
            candles = _cached_candles(sym, interval, bars)["candles"]
            series = None
        ind = dict(a["indicators"])
        ind["series"] = series
        return jsonify({
            "status": "ok", "symbol": sym, "range": rng, "candles": candles,
            "indicators": ind, "setup": a["setup"], "thesis": a["thesis"],
            "provider": a["provider"], "lastUpdated": a["lastUpdated"],
            "data_status": "END_OF_DAY",
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@bp.post("/scan")
def scan():
    body = request.get_json(silent=True) or {}
    uni = UNIVERSES.get(body.get("universe", ""))
    if not uni:
        return _err("bad_request", f"universe must be one of {', '.join(UNIVERSES)}")
    if not TD_KEY():
        return jsonify({"status": "not_configured", "message": "TWELVEDATA_API_KEY is not set on the server."})
    ok, failed = _scan_symbols(uni["symbols"])
    qualified = [r for r in ok if r["status"] in ("READY", "WATCH", "EARLY")]
    return jsonify({
        "status": "ok", "universe": uni["label"], "markets_scanned": len(uni["symbols"]),
        "analyzed": len(ok), "qualified_count": len(qualified),
        "results": ok, "failed": failed,
        "scannedAt": datetime.now(timezone.utc).isoformat(), "data_status": "END_OF_DAY",
    })


@bp.post("/watchlist/analyze")
def watchlist_analyze():
    body = request.get_json(silent=True) or {}
    symbols = [s.strip().upper() for s in body.get("symbols", []) if SYMBOL_RE.match(str(s).strip().upper())][:25]
    if not symbols:
        return _err("bad_request", "symbols must be a non-empty list.")
    if not TD_KEY():
        return jsonify({"status": "not_configured", "message": "TWELVEDATA_API_KEY is not set on the server."})
    rows, failed = [], []

    def one(sym: str):
        try:
            return sym, _daily_analysis(sym), None
        except Exception as e:
            return sym, None, str(e)

    with ThreadPoolExecutor(max_workers=4) as ex:
        for sym, a, e in ex.map(one, symbols):
            if a is None or a.get("status") != "ok":
                failed.append({"symbol": sym, "error": e or (a or {}).get("message", "no data")})
                continue
            row = _summary(a)
            row["signal"] = engine.watchlist_signal(a)
            row["target"] = a["setup"]["levels"]["target1"]
            rows.append(row)
    rows.sort(key=lambda r: (r["signal"] != "BUY", -r["score"]))
    best = next((r for r in rows if r["signal"] == "BUY"), None)
    return jsonify({"status": "ok", "results": rows, "failed": failed, "best_buy": best,
                    "updatedAt": datetime.now(timezone.utc).isoformat()})


@bp.post("/risk")
def risk():
    b = request.get_json(silent=True) or {}
    try:
        res = engine.position_size(
            float(b["account"]), float(b["risk_pct"]), float(b["entry"]), float(b["stop"]),
            float(b["target1"]) if b.get("target1") not in (None, "") else None,
            float(b["target2"]) if b.get("target2") not in (None, "") else None,
            float(b["max_position_pct"]) if b.get("max_position_pct") not in (None, "") else None)
    except (KeyError, TypeError, ValueError):
        return _err("bad_request", "account, risk_pct, entry and stop are required numbers.")
    return jsonify(res)


def _num(v: Any) -> float | None:
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _td_get(path: str, symbol: str) -> dict:
    r = requests.get(f"https://api.twelvedata.com/{path}", params={"symbol": symbol, "apikey": TD_KEY()}, timeout=25)
    data = r.json() if r.content else {}
    if r.status_code != 200 or data.get("status") == "error":
        raise RuntimeError(data.get("message") or f"HTTP {r.status_code}")
    return data


@bp.get("/research")
def research():
    sym = _symbol()
    if not sym:
        return _err("bad_request", "A valid symbol is required.")
    if not TD_KEY():
        return jsonify({"status": "not_configured", "message": "TWELVEDATA_API_KEY is not set on the server."})
    out: dict[str, Any] = {"status": "ok", "symbol": sym, "sources": ["Twelve Data /statistics", "Twelve Data /profile", "Twelve Data /earnings"],
                           "fetchedAt": datetime.now(timezone.utc).isoformat()}
    errors: dict[str, str] = {}
    try:
        st = _td_get("statistics", sym).get("statistics", {})
        val, fin = st.get("valuations_metrics", {}), st.get("financials", {})
        inc, bs, cf = fin.get("income_statement", {}), fin.get("balance_sheet", {}), fin.get("cash_flow", {})
        px, sh = st.get("stock_price_summary", {}), st.get("stock_statistics", {})
        out["fundamentals"] = {
            "market_cap": _num(val.get("market_capitalization")), "pe": _num(val.get("trailing_pe")),
            "forward_pe": _num(val.get("forward_pe")), "peg": _num(val.get("peg_ratio")),
            "price_to_sales": _num(val.get("price_to_sales_ttm")), "price_to_book": _num(val.get("price_to_book_mrq")),
            "revenue": _num(inc.get("revenue_ttm")), "revenue_growth_yoy": _num(inc.get("quarterly_revenue_growth")),
            "eps": _num(inc.get("diluted_eps_ttm")), "eps_growth_yoy": _num(inc.get("quarterly_earnings_growth_yoy")),
            "profit_margin": _num(fin.get("profit_margin")), "operating_margin": _num(fin.get("operating_margin")),
            "roe": _num(fin.get("return_on_equity_ttm")), "roa": _num(fin.get("return_on_assets_ttm")),
            "debt_to_equity": _num(bs.get("total_debt_to_equity_mrq")), "total_debt": _num(bs.get("total_debt_mrq")),
            "free_cash_flow": _num(cf.get("levered_free_cash_flow_ttm")),
            "beta": _num(px.get("beta")), "52w_high": _num(px.get("fifty_two_week_high")), "52w_low": _num(px.get("fifty_two_week_low")),
            "shares_outstanding": _num(sh.get("shares_outstanding")),
        }
    except Exception as e:
        errors["fundamentals"] = str(e)
    try:
        p = _td_get("profile", sym)
        out["profile"] = {k: p.get(k) for k in ("name", "sector", "industry", "exchange", "employees", "website", "description", "type")}
    except Exception as e:
        errors["profile"] = str(e)
    try:
        ev = _td_get("earnings", sym).get("earnings", [])
        out["earnings"] = [
            {"date": e.get("date"), "eps_estimate": _num(e.get("eps_estimate")), "eps_actual": _num(e.get("eps_actual")),
             "surprise_pct": _num(e.get("surprise_prc"))}
            for e in ev if e.get("eps_actual") is not None][:8]
    except Exception as e:
        errors["earnings"] = str(e)
    out["errors"] = errors
    # No licensed news/catalyst provider is wired into this server yet.
    out["news"] = {"status": "unavailable", "message": "No news provider is configured; nothing is generated in its place."}
    out["catalysts"] = {"status": "unavailable", "message": "Catalysts require a sourced provider; none is configured."}
    return jsonify(out)


SYSTEM_PROMPT = (
    "You are a decision-support analyst. Write a concise brief (under 220 words, plain text, no markdown headers, "
    "no investment advice) with three parts: Setup read, Levels to watch, Risk flags. Use ONLY the numbers in the "
    "JSON provided. Never invent prices, indicators, news, targets or probabilities. If a field is null, say it is unavailable."
)


@bp.post("/ai")
def ai_analysis():
    sym = _symbol()
    if not sym:
        return _err("bad_request", "A valid symbol is required.")
    if not NIM_KEY():
        return jsonify({"status": "not_configured", "message": "NVIDIA_NIM_API_KEY is not set on the server."})
    if not TD_KEY():
        return jsonify({"status": "not_configured", "message": "TWELVEDATA_API_KEY is not set on the server."})
    try:
        a = _daily_analysis(sym)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    if a["status"] != "ok":
        return jsonify(a)
    ind = {k: v for k, v in a["indicators"].items() if k != "series"}
    import json
    payload = json.dumps({"symbol": sym, "indicators": ind,
                          "setup": {k: a["setup"][k] for k in ("setupType", "status", "score", "rrRatio", "levels", "reasons")}})
    last_err = "no model available"
    for model in NIM_MODELS():
        try:
            r = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {NIM_KEY()}", "Content-Type": "application/json"},
                json={"model": model, "temperature": 0.2, "max_tokens": 600,
                      "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                   {"role": "user", "content": payload}]},
                timeout=60)
            data = r.json() if r.content else {}
            if r.status_code != 200:
                last_err = f"{model}: {data.get('detail') or data.get('message') or r.status_code}"
                continue
            text = (data["choices"][0]["message"].get("content") or "").strip()
            if text:
                return jsonify({"status": "ok", "analysis": text, "model": model})
            last_err = f"{model}: empty response"
        except Exception as e:
            last_err = f"{model}: {e}"
    return jsonify({"status": "error", "message": f"NVIDIA NIM request failed ({last_err})."})
