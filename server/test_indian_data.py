import unittest
from unittest.mock import patch
import requests
from indian_data import IndianClient, IndianError, normalize_quote, normalize_history

QUOTE = {"tickerId": "RELIANCE", "companyName": "Reliance Industries", "currentPrice": {"NSE": "1,500", "BSE": 1501}, "percentChange": 1.2}
HISTORY = {"datasets": [{"metric": "Price", "label": "Price on NSE", "values": [["2026-10-08", "1495"], ["2026-10-09", "1500"]], "meta": {"is_weekly": False}}]}


class Response:
    status_code = 200
    def __init__(self, value):
        self.value = value
    def json(self):
        return self.value


class IndianTests(unittest.TestCase):
    def test_quote_exchange_and_missing_prices(self):
        q = normalize_quote(QUOTE, "Reliance", "BSE")
        self.assertEqual(q["price"], 1501)
        self.assertIsNone(q["change"])  # Scalar change has no exchange provenance.
        with self.assertRaises(IndianError):
            normalize_quote({**QUOTE, "currentPrice": {"NSE": None}}, "Reliance", "NSE")

    def test_price_history_does_not_create_candles_or_switch_exchange(self):
        h = normalize_history(HISTORY, "NSE")
        self.assertEqual(h["points"][-1], {"date": "2026-10-09", "price": 1500})
        self.assertNotIn("open", h["points"][0])
        with self.assertRaises(IndianError):
            normalize_history(HISTORY, "BSE")

    @patch('indian_data.time.sleep')
    def test_auth_header_quote_cache_shared_between_exchanges_and_history_cache(self, sleep):
        calls = []
        def transport(url, **kwargs):
            calls.append((url, kwargs))
            return Response(HISTORY if url.endswith('historical_data') else QUOTE)
        client = IndianClient('private-test-key', transport)
        first = client.stock('Reliance', 'NSE', True)
        second = client.stock('RELIANCE', 'NSE', True)
        third = client.stock('Reliance', 'BSE')
        self.assertFalse(first['cached'])
        self.assertTrue(second['cached'])
        self.assertTrue(second['history_cached'])
        self.assertEqual(third['quote']['price'], 1501)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][1]['headers']['X-API-Key'], 'private-test-key')
        self.assertNotIn('private-test-key', calls[0][0])
        self.assertEqual(calls[1][1]['params']['stock_name'], 'RELIANCE')

    @patch('indian_data.time.sleep')
    def test_no_secret_leak_and_history_failure_preserves_quote(self, sleep):
        def transport(url, **kwargs):
            if url.endswith('historical_data'):
                raise requests.ConnectionError('private-test-key upstream failure')
            return Response(QUOTE)
        result = IndianClient('private-test-key', transport).stock('Reliance', history=True)
        self.assertEqual(result['quote']['price'], 1500)
        self.assertIsNone(result['history'])
        self.assertNotIn('private-test-key', result['history_error'])

    def test_budget_and_invalid_names_do_not_call_upstream(self):
        def fail(*args, **kwargs):
            self.fail('Upstream must not be called')
        client = IndianClient('test-key', fail)
        client.usage()
        client.day_calls = 12
        with self.assertRaises(IndianError) as error:
            client.stock('Reliance')
        self.assertEqual(error.exception.status, 429)
        for name in ['', '<script>', 'x' * 81]:
            with self.assertRaises(IndianError):
                client.stock(name)
        with self.assertRaises(IndianError):
            client.stock('Reliance', 'NYSE')
        with self.assertRaises(IndianError):
            IndianClient('').stock('Reliance')

    @patch('indian_data.time.sleep')
    def test_provider_quota_and_auth_failures_have_safe_messages(self, sleep):
        for code in (401, 403, 429, 500):
            def transport(*args, **kwargs):
                response = Response({'detail': 'private-test-key'})
                response.status_code = code
                return response
            with self.assertRaises(IndianError) as error:
                IndianClient('private-test-key', transport).stock('Reliance')
            self.assertNotIn('private-test-key', str(error.exception))

    def test_health_diagnostic_does_not_expose_names_or_keys(self):
        import app
        for environment, status in [({}, 'absent'), ({'INDIANAPI_API_KEY': ''}, 'empty'), ({'INDIANAPI_API_KEY': 'private-test-key'}, 'configured')]:
            result = app.indian_key_status(environment)
            self.assertEqual(result['status'], status)
            self.assertNotIn('private-test-key', str(result))
        result = app.indian_key_status({'INDIANAPI_API_KEY ': 'private-test-key'})
        self.assertEqual(result['status'], 'absent')
        self.assertTrue(result['similar_name_present'])
        self.assertNotIn('private-test-key', str(result))

    def test_flask_route_health_and_history_flag(self):
        import app
        with patch.object(app.indian_client, 'stock', return_value={'provider': 'indianapi'}) as stock:
            client = app.app.test_client()
            self.assertIn('indianapi', client.get('/api/health').json['providers'])
            self.assertEqual(client.get('/api/india/stock?name=Reliance&history=2').status_code, 400)
            response = client.get('/api/india/stock?name=Reliance&exchange=BSE&history=1')
            self.assertEqual(response.status_code, 200)
            stock.assert_called_once_with('Reliance', 'BSE', True)


if __name__ == '__main__':
    unittest.main()
