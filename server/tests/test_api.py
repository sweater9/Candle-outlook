import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pytest
import app as appmod
import meridian_api


def fake_fetch(symbol, interval, limit):
    candles = [{"time": f"{i}", "open": 100 + i * .3, "high": 101 + i * .3, "low": 99 + i * .3, "close": 100.5 + i * .3, "volume": 1000 + i}
               for i in range(limit if limit < 400 else 400)]
    return {"provider": "fake", "symbol": symbol, "interval": interval, "candles": candles}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TWELVEDATA_API_KEY", "x")
    meridian_api._cache.clear()
    meridian_api.init(fake_fetch)
    yield appmod.app.test_client()
    meridian_api.init(appmod.fetch_twelvedata)


def test_status_and_universes(client):
    assert client.get("/api/meridian/status").json["twelvedata"] is True
    assert "etfs" in client.get("/api/meridian/universes").json


def test_instrument(client):
    j = client.get("/api/meridian/instrument?symbol=AAPL&range=3M").json
    assert j["status"] == "ok" and len(j["candles"]) == 66 and j["indicators"]["series"]["ema20"]
    assert client.get("/api/meridian/instrument?symbol=%3Cbad%3E").status_code == 400


def test_scan_and_watchlist(client):
    j = client.post("/api/meridian/scan", json={"universe": "etfs"}).json
    assert j["status"] == "ok" and j["analyzed"] == 25
    assert all(0 <= r["score"] <= 100 for r in j["results"])
    w = client.post("/api/meridian/watchlist/analyze", json={"symbols": ["AAPL", "MSFT"]}).json
    assert {r["signal"] for r in w["results"]} <= {"BUY", "SELL", "HOLD", "WAIT"}


def test_risk(client):
    j = client.post("/api/meridian/risk", json={"account": 50000, "risk_pct": 1, "entry": 100, "stop": 95, "target1": 110}).json
    assert j["shares"] == 100 and j["maxLoss"] == 500


def test_not_configured(client, monkeypatch):
    monkeypatch.delenv("TWELVEDATA_API_KEY")
    assert client.get("/api/meridian/instrument?symbol=AAPL").json["status"] == "not_configured"
    monkeypatch.delenv("NVIDIA_NIM_API_KEY", raising=False)
    assert client.post("/api/meridian/ai", json={"symbol": "AAPL"}).json["status"] == "not_configured"
