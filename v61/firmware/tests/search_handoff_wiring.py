"""Source-boundary checks; these do not simulate actual TLS or hardware."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
search = (root / 'src/WebResearch.cpp').read_text()
main = (root / 'src/main.cpp').read_text()
live = (root / 'src/GeminiLiveProbe.cpp').read_text()
start = search.split('bool start(const String& query)', 1)[1].split('bool takeResult', 1)[0]
# The hook may cancel search/Live. It must run before reservation, outside the mutex,
# and every raw/API/voice call is forced through it before a worker notification.
assert 'if (!allowed || !prepareSearch) return false;' in start
assert start.index('xSemaphoreGive(mutex);') < start.index('prepareSearch();')
assert start.index('prepareSearch();') < start.index('state.start(pendingToken)') < start.index('xTaskNotifyGive(task)')
prepare = main.split('WebResearch::setPrepare([]()', 1)[1].split('});', 1)[0]
assert prepare.index('WakeWord::stop()') < prepare.index('gemini.disconnect')
assert 'client.setCACert(kTavilyRoots)' in search
assert 'setInsecure' not in search
assert 'if (WebResearch::busy())' in live.split('bool GeminiLiveProbe::connect()', 1)[1].split('void GeminiLiveProbe::disconnect', 1)[0]
assert 'w.search = WebResearch::busy();' in main
assert 'w.conversation = busy || gemini.isConnecting();' in main
dispatch = live.split('void GeminiLiveProbe::loop()', 1)[1].split('drainWsEvents();', 1)[0]
assert 'WebResearch::start(query)' in dispatch and 'buildSearchAnswer(result)' in dispatch
tool = live.split('if (toolName == "search_web")', 1)[1].split('if (toolName == "control_lights")', 1)[0]
assert 'search_handoff_.queue(' in tool and 'WebResearch::start(' not in tool
disconnect = live.split('void GeminiLiveProbe::disconnect(', 1)[1].split('void GeminiLiveProbe::loop', 1)[0]
assert 'search_handoff_.cancel()' in disconnect and 'heap_caps_free(handoff_packet_)' in disconnect
assert 'WebResearch::cancel()' in disconnect and 'clearWsQueues(true)' in disconnect
print('Search preparation, verified TLS, deferred dispatch, reconnect and cancellation wiring passed (hardware unverified)')