"""Run locally against a physical v8 robot; never asks for or prints API keys."""
import json
import sys
import time
import urllib.request

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://192.168.0.188'

def request(path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, body, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)

status = request('/api/status')
assert status['firmware_version'] == 'custom-v8', 'Wrong firmware version'
assert status['gemini_api_key'] == 'set', 'Gemini key missing'
assert status['wake_word_available'] is False, 'Unexpected wake-word claim'
assert not status['gemini']['ready'], 'Stop conversation with Wake / sleep first'
assert status['web_search']['configured'], 'Enable web search and save a Tavily key first'
assert request('/api/search/test', {'query': 'Senaste nyheterna om Svenska Röda Korset med publiceringsdatum och källor'})['started']
deadline = time.monotonic() + 100
while time.monotonic() < deadline:
    result = request('/api/search/test')
    if 'searched_web' in result:
        print('Search result:', 'verified sources' if result.get('ok') else result.get('error'))
        if not result.get('ok'):
            print('HTTP status:', result.get('http_status'))
            sys.exit(1)
        assert result['searched_web'] is True and len(result['sources']) > 0
        after = request('/api/status')
        assert after['uptime_ms'] >= status['uptime_ms'], 'Robot rebooted during search'
        print('PASS: physical robot completed Google search without reboot')
        break
    time.sleep(1)
else:
    raise TimeoutError('No search result within 100 seconds')