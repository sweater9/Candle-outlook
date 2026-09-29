"""
Deterministic technical-analysis, setup-scoring and risk engine for Meridian.

Pure functions only: no network, no I/O. Everything returned is derived from the
candles passed in; nothing is estimated or invented. When an input is too short
the value is None ("Data unavailable").
"""

from __future__ import annotations

import math
from typing import Any, Optional

Candle = dict  # {"time","open","high","low","close","volume"}


# ---------------------------------------------------------------- primitives

def sma(values: list[float], period: int) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    window = sum(values[:period])
    out[period - 1] = window / period
    for i in range(period, len(values)):
        window += values[i] - values[i - period]
        out[i] = window / period
    return out


def ema(values: list[float], period: int) -> list[Optional[float]]:
    """EMA seeded with the SMA of the first `period` values."""
    out: list[Optional[float]] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    k = 2.0 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(closes: list[float], period: int = 14) -> list[Optional[float]]:
    """Wilder's RSI."""
    out: list[Optional[float]] = [None] * len(closes)
    if len(closes) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    avg_g, avg_l = gains / period, losses / period

    def val(g: float, l: float) -> float:
        if l == 0:
            return 100.0 if g > 0 else 50.0
        return 100.0 - 100.0 / (1.0 + g / l)

    out[period] = val(avg_g, avg_l)
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0.0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0.0)) / period
        out[i] = val(avg_g, avg_l)
    return out


def macd(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9):
    """Returns (macd_line, signal_line, histogram), each aligned to closes."""
    ef, es = ema(closes, fast), ema(closes, slow)
    line: list[Optional[float]] = [
        (a - b) if a is not None and b is not None else None for a, b in zip(ef, es)
    ]
    first = next((i for i, v in enumerate(line) if v is not None), None)
    sig: list[Optional[float]] = [None] * len(closes)
    if first is not None:
        tail = [v for v in line[first:]]  # all non-None from `first`
        s = ema(tail, signal)  # type: ignore[arg-type]
        for i, v in enumerate(s):
            sig[first + i] = v
    hist = [(m - s_) if m is not None and s_ is not None else None for m, s_ in zip(line, sig)]
    return line, sig, hist


def atr(candles: list[Candle], period: int = 14) -> list[Optional[float]]:
    """Wilder's average true range."""
    n = len(candles)
    out: list[Optional[float]] = [None] * n
    if n <= period:
        return out
    tr = [candles[0]["high"] - candles[0]["low"]]
    for i in range(1, n):
        h, l, pc = candles[i]["high"], candles[i]["low"], candles[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    prev = sum(tr[1 : period + 1]) / period
    out[period] = prev
    for i in range(period + 1, n):
        prev = (prev * (period - 1) + tr[i]) / period
        out[i] = prev
    return out


def annualized_volatility(closes: list[float], window: int = 20) -> Optional[float]:
    """Std-dev of daily log returns over `window` bars x sqrt(252), in percent."""
    if len(closes) < window + 1:
        return None
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - window, len(closes))
            if closes[i - 1] > 0 and closes[i] > 0]
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var) * math.sqrt(252) * 100.0


# ---------------------------------------------------------------- indicators

def _last(seq: list[Optional[float]]) -> Optional[float]:
    return seq[-1] if seq else None


def compute_indicators(candles: list[Candle]) -> Optional[dict[str, Any]]:
    """Daily-candle indicator snapshot + aligned overlay series. None if < 30 bars."""
    if len(candles) < 30:
        return None
    closes = [c["close"] for c in candles]
    vols = [c["volume"] for c in candles]
    last = candles[-1]
    prev_close = candles[-2]["close"]

    e20, e50, s200 = ema(closes, 20), ema(closes, 50), sma(closes, 200)
    r = rsi(closes, 14)
    m_line, m_sig, m_hist = macd(closes)
    a = atr(candles, 14)

    # Support / resistance: 20-bar swing low/high excluding the current bar.
    prior = candles[-21:-1]
    support = min(c["low"] for c in prior)
    resistance = max(c["high"] for c in prior)

    year = candles[-252:]
    high52 = max(c["high"] for c in year)
    low52 = min(c["low"] for c in year)

    avg_vol = sum(vols[-21:-1]) / 20 if len(vols) >= 21 else None
    vol_ratio = (last["volume"] / avg_vol) if avg_vol else None

    close = last["close"]
    ema20, ema50, sma200_v = _last(e20), _last(e50), _last(s200)
    if ema20 is None or ema50 is None:
        trend = "NEUTRAL"
    elif close > ema20 > ema50 and (sma200_v is None or close > sma200_v):
        trend = "BULLISH"
    elif close < ema20 < ema50 and (sma200_v is None or close < sma200_v):
        trend = "BEARISH"
    else:
        trend = "NEUTRAL"

    rsi_v, macd_v, sig_v = _last(r), _last(m_line), _last(m_sig)
    if rsi_v is not None and macd_v is not None and sig_v is not None:
        if rsi_v >= 60 and macd_v > sig_v:
            momentum = "STRONG"
        elif rsi_v <= 40 and macd_v < sig_v:
            momentum = "WEAK"
        else:
            momentum = "MODERATE"
    else:
        momentum = None

    ret20 = (close / closes[-21] - 1) * 100 if len(closes) >= 21 else None

    def series(vals: list[Optional[float]]) -> list[Optional[float]]:
        return vals

    return {
        "lastClose": close,
        "prevClose": prev_close,
        "pctChange": (close / prev_close - 1) * 100 if prev_close else None,
        "ema20": ema20, "ema50": ema50, "sma200": sma200_v,
        "rsi": rsi_v, "macd": macd_v, "macdSignal": sig_v, "macdHist": _last(m_hist),
        "atr": _last(a),
        "volatility": annualized_volatility(closes),
        "volRatio": vol_ratio,
        "support": support, "resistance": resistance,
        "high52": high52, "low52": low52,
        "distHigh52": (close / high52 - 1) * 100,
        "return20d": ret20,
        "trend": trend, "momentum": momentum,
        "series": {"ema20": series(e20), "ema50": series(e50), "sma200": series(s200)},
    }


# ---------------------------------------------------------------- setups

STATUSES = ["READY", "WATCH", "EARLY", "EXTENDED", "RISKY", "AVOID", "NO SETUP"]


def detect_setup_type(ind: dict, candles: list[Candle]) -> tuple[str, list[str]]:
    """Return (setup_type, reasons). Reasons cite only calculated values."""
    close, last = ind["lastClose"], candles[-1]
    atr_v, rsi_v = ind["atr"], ind["rsi"]
    vol = ind["volRatio"]
    reasons: list[str] = []
    if atr_v is None or rsi_v is None:
        return "NO SETUP", ["Not enough history to evaluate."]

    if close > ind["resistance"] and vol is not None and vol >= 1.3:
        reasons.append(f"Close {close:.2f} is above 20-bar resistance {ind['resistance']:.2f} on {vol:.2f}x average volume.")
        return "BREAKOUT", reasons
    if ind["trend"] == "BULLISH" and ind["ema20"] is not None and abs(close - ind["ema20"]) <= atr_v and 38 <= rsi_v <= 55:
        reasons.append(f"Bullish trend with price within 1 ATR of the 20-day EMA and RSI {rsi_v:.0f}.")
        return "PULLBACK", reasons
    if abs(close - ind["support"]) <= 0.5 * atr_v and close > last["open"]:
        reasons.append(f"Green candle closing within 0.5 ATR of support {ind['support']:.2f}.")
        return "SUPPORT BOUNCE", reasons
    if rsi_v < 35 and close > ind["prevClose"]:
        reasons.append(f"RSI {rsi_v:.0f} is oversold and price closed up on the day.")
        return "REVERSAL WATCH", reasons
    ret20 = ind["return20d"]
    if (rsi_v >= 60 and ind["macd"] is not None and ind["macdSignal"] is not None
            and ind["macd"] > ind["macdSignal"] and ret20 is not None and ret20 >= 5):
        reasons.append(f"20-day return {ret20:.1f}% with RSI {rsi_v:.0f} and MACD above its signal line.")
        return "MOMENTUM", reasons
    if ind["trend"] == "BULLISH" and 50 <= rsi_v < 70:
        reasons.append(f"Price above EMA20/EMA50 with RSI {rsi_v:.0f}.")
        return "TREND CONTINUATION", reasons
    return "NO SETUP", ["No scanner rule matched the current calculated values."]


def plan_levels(ind: dict) -> dict[str, Optional[float]]:
    """Deterministic stop/target reference used for R:R scoring.

    stop   = lower of (close - 1.5 x ATR) and (support - 0.25 x ATR)... capped so the
             stop is always below the close.
    target1 = nearest resistance above the close, if any
    target2 = 52-week high, if above target1
    """
    close, atr_v = ind["lastClose"], ind["atr"]
    if atr_v is None:
        return {"entry": close, "stop": None, "target1": None, "target2": None, "rr": None}
    stop = min(close - 1.5 * atr_v, ind["support"] - 0.25 * atr_v) if ind["support"] < close else close - 1.5 * atr_v
    if stop >= close:
        stop = close - 1.5 * atr_v
    t1 = ind["resistance"] if ind["resistance"] > close else None
    t2 = ind["high52"] if (t1 is not None and ind["high52"] > t1) else None
    rr = (t1 - close) / (close - stop) if t1 is not None and close > stop else None
    return {"entry": close, "stop": stop, "target1": t1, "target2": t2, "rr": rr}


def score_setup(ind: dict, setup_type: str) -> dict[str, Any]:
    """Explainable 0-100 score. Fundamentals/Catalysts are 0 with an explicit note
    because the scanner does not evaluate them."""
    tech: list[tuple[str, int, int, str]] = []
    trend_pts = {"BULLISH": 15, "NEUTRAL": 7, "BEARISH": 0}[ind["trend"]]
    tech.append(("Trend", trend_pts, 15, f"Trend is {ind['trend']} (price vs EMA20/EMA50/SMA200)."))
    ref = ind["sma200"] if ind["sma200"] is not None else ind["ema50"]
    ref_name = "SMA200" if ind["sma200"] is not None else "EMA50"
    above = ref is not None and ind["lastClose"] > ref
    tech.append(("Long-term position", 5 if above else 0, 5, f"Price {'above' if above else 'below'} {ref_name}."))
    vr = ind["volRatio"]
    vp = 1 if vr is None else 5 if vr >= 1.3 else 3 if vr >= 1.0 else 1
    tech.append(("Volume", vp, 5, "Volume vs 20-day average unavailable." if vr is None else f"Volume is {vr:.2f}x the 20-day average."))
    sp = 10 if setup_type in ("BREAKOUT", "PULLBACK") else 7 if setup_type != "NO SETUP" else 0
    tech.append(("Setup pattern", sp, 10, f"Detected setup: {setup_type}."))

    rsi_v = ind["rsi"]
    if rsi_v is None:
        rp, rnote = 0, "RSI unavailable."
    elif 50 <= rsi_v <= 65:
        rp, rnote = 10, f"RSI {rsi_v:.0f} is in the constructive 50-65 zone."
    elif 40 <= rsi_v < 50 or 65 < rsi_v <= 70:
        rp, rnote = 6, f"RSI {rsi_v:.0f} is neutral-to-warm."
    else:
        rp, rnote = 2, f"RSI {rsi_v:.0f} is at an extreme."
    m, s = ind["macd"], ind["macdSignal"]
    if m is None or s is None:
        mp, mnote = 0, "MACD unavailable."
    elif m > s and m > 0:
        mp, mnote = 10, "MACD above its signal line and above zero."
    elif m > s:
        mp, mnote = 6, "MACD above its signal line but below zero."
    else:
        mp, mnote = 0, "MACD below its signal line."
    mom = [("RSI", rp, 10, rnote), ("MACD", mp, 10, mnote)]

    lv = plan_levels(ind)
    rr = lv["rr"]
    if rr is None:
        rrp, rrnote = 0, "No overhead resistance to measure risk/reward against."
    else:
        rrp = 20 if rr >= 3 else 15 if rr >= 2 else 10 if rr >= 1.5 else 5 if rr >= 1 else 0
        rrnote = f"Risk/reward to nearest resistance is {rr:.2f} : 1 (stop 1.5 ATR / below support)."
    rrs = [("Risk/reward", rrp, 20, rrnote)]

    def block(name: str, items: list[tuple[str, int, int, str]], cap: int):
        return {"name": name, "score": sum(i[1] for i in items), "max": cap,
                "items": [{"label": a, "points": b, "max": c, "note": d} for a, b, c, d in items]}

    breakdown = [
        block("Technical", tech, 35),
        block("Momentum", mom, 20),
        {"name": "Fundamentals", "score": 0, "max": 15, "items": [], "note": "Not evaluated by the scanner — see Research."},
        {"name": "Catalysts", "score": 0, "max": 10, "items": [], "note": "Not evaluated by the scanner — see Research."},
        block("Risk/Reward", rrs, 20),
    ]
    return {"total": sum(b["score"] for b in breakdown), "breakdown": breakdown, "levels": lv}


def classify_status(ind: dict, setup_type: str, score: int, rr: Optional[float]) -> str:
    if setup_type == "NO SETUP":
        return "NO SETUP"
    if ind["trend"] == "BEARISH" and setup_type not in ("REVERSAL WATCH", "SUPPORT BOUNCE"):
        return "AVOID"
    atr_v, ema20, rsi_v = ind["atr"], ind["ema20"], ind["rsi"]
    if rsi_v is not None and rsi_v >= 75 or (rr is not None and rr < 1):
        return "RISKY"
    if (atr_v and ema20 and ind["lastClose"] - ema20 > 2.5 * atr_v) or (rsi_v is not None and rsi_v > 68) \
            or (ind["distHigh52"] > -2 and setup_type != "BREAKOUT"):
        return "EXTENDED"
    if setup_type in ("BREAKOUT", "PULLBACK", "SUPPORT BOUNCE") and score >= 55 and rr is not None and rr >= 2:
        return "READY"
    if score >= 45:
        return "WATCH"
    return "EARLY"


def build_thesis(ind: dict, setup_type: str, status: str) -> str:
    """Plain-English text assembled only from calculated values."""
    parts = [f"Trend is {ind['trend'].lower()}"]
    if ind["momentum"]:
        parts[0] += f" with momentum {ind['momentum'].lower()}."
    else:
        parts[0] += "."
    if ind["ema20"] and ind["ema50"]:
        rel = "above" if ind["lastClose"] > max(ind["ema20"], ind["ema50"]) else \
              "below" if ind["lastClose"] < min(ind["ema20"], ind["ema50"]) else "between"
        parts.append(f"Price is {rel} its 20- and 50-day moving averages.")
    if ind["rsi"] is not None and ind["atr"] is not None:
        pct = ind["atr"] / ind["lastClose"] * 100
        parts.append(f"RSI is {ind['rsi']:.0f} and the 14-day ATR is {ind['atr']:.2f} ({pct:.1f}% of price).")
    parts.append(f"Nearest support is {ind['support']:.2f} and resistance is {ind['resistance']:.2f}.")
    parts.append(f"Detected setup: {setup_type} ({status}).")
    parts.append(f"Price is {ind['distHigh52']:.1f}% from its 52-week high.")
    return " ".join(parts)


def analyze(symbol: str, candles: list[Candle]) -> dict[str, Any]:
    """Full analysis for one symbol from daily candles."""
    ind = compute_indicators(candles)
    if ind is None:
        return {"symbol": symbol, "status": "no_data", "message": "Not enough price history (need 30+ daily bars)."}
    stype, reasons = detect_setup_type(ind, candles)
    sc = score_setup(ind, stype)
    rr = sc["levels"]["rr"]
    status = classify_status(ind, stype, sc["total"], rr)
    return {
        "symbol": symbol, "status": "ok", "indicators": ind,
        "setup": {"setupType": stype, "status": status, "score": sc["total"],
                  "breakdown": sc["breakdown"], "reasons": reasons, "rrRatio": rr, "levels": sc["levels"]},
        "thesis": build_thesis(ind, stype, status),
    }


def watchlist_signal(a: dict) -> str:
    """BUY / SELL / HOLD / WAIT from an `analyze` result."""
    ind, setup = a["indicators"], a["setup"]
    if setup["status"] == "READY":
        return "BUY"
    if ind["trend"] == "BEARISH" and ind["macd"] is not None and ind["macdSignal"] is not None and ind["macd"] < ind["macdSignal"]:
        return "SELL"
    if ind["trend"] == "BULLISH" and setup["status"] not in ("EXTENDED", "RISKY"):
        return "HOLD"
    return "WAIT"


# ---------------------------------------------------------------- risk

def position_size(account: float, risk_pct: float, entry: float, stop: float,
                  target1: Optional[float] = None, target2: Optional[float] = None,
                  max_position_pct: Optional[float] = None) -> dict[str, Any]:
    """Long-only fixed-fractional sizing.

    risk capital  = account x risk% / 100
    risk / share  = entry - stop
    shares        = floor(risk capital / risk per share), then capped by max position %
    """
    errors = []
    if account <= 0: errors.append("Account value must be positive.")
    if not 0 < risk_pct <= 100: errors.append("Risk % must be between 0 and 100.")
    if entry <= 0: errors.append("Entry must be positive.")
    if stop <= 0: errors.append("Stop must be positive.")
    if entry > 0 and stop > 0 and stop >= entry: errors.append("Stop must be below entry for a long position.")
    if max_position_pct is not None and not 0 < max_position_pct <= 100:
        errors.append("Max position % must be between 0 and 100.")
    if errors:
        return {"ok": False, "errors": errors}

    risk_capital = account * risk_pct / 100.0
    rps = entry - stop
    shares_by_risk = math.floor(risk_capital / rps)
    shares, capped = shares_by_risk, False
    if max_position_pct is not None:
        by_position = math.floor(account * max_position_pct / 100.0 / entry)
        if by_position < shares:
            shares, capped = by_position, True
    also_by_cash = math.floor(account / entry)
    if also_by_cash < shares:
        shares, capped = also_by_cash, True

    def reward(t: Optional[float]):
        if t is None or t <= entry:
            return None
        return {"target": t, "perShare": t - entry, "gain": (t - entry) * shares, "rr": (t - entry) / rps}

    return {
        "ok": True, "errors": [],
        "riskCapital": risk_capital, "riskPerShare": rps,
        "sharesByRisk": shares_by_risk, "shares": shares, "cappedByPositionLimit": capped,
        "positionValue": shares * entry, "positionPct": shares * entry / account * 100,
        "maxLoss": shares * rps, "actualRiskPct": shares * rps / account * 100,
        "target1": reward(target1), "target2": reward(target2),
    }
