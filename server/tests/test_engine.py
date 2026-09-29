import math
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pytest
from engine import sma, ema, rsi, atr, macd, position_size, compute_indicators, analyze, watchlist_signal


def candles_from(closes, spread=1.0, vol=1000):
    out = []
    for i, c in enumerate(closes):
        out.append({"time": str(i), "open": c, "high": c + spread / 2, "low": c - spread / 2, "close": c, "volume": vol})
    return out


def test_sma():
    assert sma([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_known_values():
    # seeded with SMA(3)=2, k=0.5 -> 3, 4
    assert ema([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]
    assert ema([10, 10, 10, 20], 3)[-1] == pytest.approx(15.0)


def test_rsi_extremes():
    assert rsi(list(range(1, 30)))[-1] == 100.0
    assert rsi(list(range(30, 1, -1)))[-1] == pytest.approx(0.0)
    assert rsi([5.0] * 30)[-1] == 50.0


def test_rsi_wilder_reference():
    # Classic Wilder / StockCharts worked example (14-period), first RSI value ~70.53
    closes = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433,
              46.0826, 45.8931, 46.0328, 45.6140, 46.2820, 46.2820]
    assert rsi(closes)[14] == pytest.approx(70.53, abs=0.1)


def test_atr_constant_range():
    c = candles_from([100.0] * 40, spread=2.0)
    assert atr(c)[-1] == pytest.approx(2.0)


def test_macd_alignment_and_zero_on_flat():
    line, sig, hist = macd([50.0] * 60)
    assert line[-1] == pytest.approx(0.0) and sig[-1] == pytest.approx(0.0) and hist[-1] == pytest.approx(0.0)
    assert line[24] is None and line[25] is not None


def test_indicators_need_history():
    assert compute_indicators(candles_from([1.0] * 10)) is None


def test_uptrend_is_bullish():
    c = candles_from([100 + i * 0.5 for i in range(260)])
    ind = compute_indicators(c)
    assert ind["trend"] == "BULLISH"
    assert ind["high52"] >= ind["lastClose"]
    a = analyze("TST", c)
    assert a["status"] == "ok"
    assert 0 <= a["setup"]["score"] <= 100
    assert sum(b["score"] for b in a["setup"]["breakdown"]) == a["setup"]["score"]
    assert watchlist_signal(a) in {"BUY", "SELL", "HOLD", "WAIT"}


def test_downtrend_is_bearish():
    c = candles_from([300 - i * 0.5 for i in range(260)])
    assert compute_indicators(c)["trend"] == "BEARISH"


# ---- position sizing (spec example: $50k account, 1% risk => $500 max loss)

def test_position_size_spec_example():
    r = position_size(50_000, 1, entry=100, stop=95, target1=110, target2=120)
    assert r["riskCapital"] == 500
    assert r["riskPerShare"] == 5
    assert r["shares"] == 100
    assert r["maxLoss"] == 500
    assert r["positionValue"] == 10_000
    assert r["target1"]["rr"] == pytest.approx(2.0)
    assert r["target2"]["gain"] == 2000


def test_position_size_floors_shares():
    r = position_size(10_000, 1, entry=50, stop=47)  # 100/3 = 33.33
    assert r["shares"] == 33
    assert r["maxLoss"] == 99


def test_position_cap_applies_and_never_exceeds_risk():
    r = position_size(50_000, 1, entry=100, stop=99, max_position_pct=10)  # by risk 500 shs, cap 50
    assert r["shares"] == 50 and r["cappedByPositionLimit"]
    assert r["maxLoss"] <= r["riskCapital"]


def test_invalid_inputs():
    assert not position_size(50_000, 1, entry=100, stop=100)["ok"]
    assert not position_size(50_000, 1, entry=100, stop=105)["ok"]
    assert not position_size(0, 1, entry=100, stop=95)["ok"]
    assert not position_size(50_000, 0, entry=100, stop=95)["ok"]
