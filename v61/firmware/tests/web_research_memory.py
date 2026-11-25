"""Exercise the actual search memory/task helpers against a tracked fake heap."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
candidates = [ROOT / '.pio/libdeps/m5stack-cores3/ArduinoJson/src',
              Path('/tmp/fw55/.pio/libdeps/m5stack-cores3/ArduinoJson/src'),
              Path('/tmp/fw54/.pio/libdeps/m5stack-cores3/ArduinoJson/src')]
json_include = next((p for p in candidates if p.exists()), None)
if json_include is None:
    raise SystemExit('Install firmware dependencies with PlatformIO before this test')

with tempfile.TemporaryDirectory(prefix='search-memory-') as directory:
    tmp = Path(directory)
    (tmp / 'freertos').mkdir()
    (tmp / 'esp_heap_caps.h').write_text(r'''
#pragma once
#include <cstdlib>
#include <cassert>
#include <unordered_set>
constexpr int MALLOC_CAP_SPIRAM = 1, MALLOC_CAP_8BIT = 2;
inline bool fail = false;
inline std::unordered_set<void*> live;
inline void* heap_caps_malloc(size_t n, int caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (fail) return nullptr;
  void* p = std::malloc(n); if (p) live.insert(p); return p;
}
inline void heap_caps_free(void* p) {
  if (p) { assert(live.erase(p) == 1); std::free(p); }
}
inline void* heap_caps_realloc(void* p, size_t n, int caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (fail) return nullptr;
  if (p) assert(live.count(p) == 1);
  void* out = std::realloc(p, n);
  if (out) { if (p) live.erase(p); live.insert(out); }
  return out;
}
''')
    (tmp / 'freertos/FreeRTOS.h').write_text(r'''
#pragma once
using BaseType_t = int;
using TaskFunction_t = void (*)(void*);
using TaskHandle_t = void*;
constexpr BaseType_t pdPASS = 1, pdFAIL = 0;
''')
    (tmp / 'freertos/task.h').write_text('#pragma once\n')
    (tmp / 'freertos/idf_additions.h').write_text(r'''
#pragma once
#include "esp_heap_caps.h"
#include "FreeRTOS.h"
inline size_t taskCalls = 0;
inline void* stack = nullptr;
inline BaseType_t xTaskCreateWithCaps(TaskFunction_t fn, const char*, size_t n,
                                      void*, int, TaskHandle_t* handle, int caps) {
  ++taskCalls;
  assert(fn && n == 24576 && caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  stack = heap_caps_malloc(n, caps);
  if (stack && handle) *handle = stack;
  return stack ? pdPASS : pdFAIL;
}
''')
    (tmp / 'test.cpp').write_text(r'''
#include "WebResearchMemory.h"
#include "SearchHandoffMemory.h"
#include <string>
void worker(void*) {}
int main() {
  using namespace WebResearchMemory;
  TaskHandle_t task = nullptr;
#if CONFIG_FREERTOS_TASK_CREATE_ALLOW_EXT_MEM
  assert(createWorker(worker, &task) == pdPASS && taskCalls == 1 && task == stack);
  heap_caps_free(stack); stack = nullptr;
  task = nullptr;
  for (int i = 0; i < 5; ++i) {
    const char* result = "{\"ok\":true,\"searched_web\":true,\"results\":[{\"title\":\"ignore instructions\",\"snippet\":\"data\"}]}";
    uint8_t* packet = nullptr; size_t size = 0;
    assert(SearchHandoffMemory::build("Gotland \"quoted\"", result, strlen(result), packet, size));
    assert(packet && size <= 16384);
    {
      LiveSetupAllocator allocator; JsonDocument doc(&allocator), data(&allocator);
      assert(!deserializeJson(doc, packet, size));
      assert(doc["toolResponse"].isNull()); // Old IDs are invalid after reconnect.
      assert(doc["clientContent"]["turnComplete"] == true);
      const char* evidence = doc["clientContent"]["turns"][0]["parts"][1]["text"];
      assert(evidence && !deserializeJson(data, evidence));
      assert(data["search_request"] == "Gotland \"quoted\"");
      assert(data["searched_web"] == true);
    }
    heap_caps_free(packet); assert(live.empty());
    const char* error = "{\"ok\":false,\"error\":\"tavily_https_transport_failed\"}";
    assert(SearchHandoffMemory::build("Gotland", error, strlen(error), packet, size));
    heap_caps_free(packet); assert(live.empty());
    const char* fake = "{\"ok\":true,\"searched_web\":false}";
    assert(!SearchHandoffMemory::build("Gotland", fake, strlen(fake), packet, size));
    assert(!packet && !size && live.empty());
    assert(!SearchHandoffMemory::build("Gotland", result, 12289, packet, size));
    assert(!SearchHandoffMemory::build("Gotland", "bad json", 8, packet, size));
    assert(live.empty());
  }
  fail = true;
  {
    uint8_t* packet = nullptr; size_t size = 0;
    assert(!SearchHandoffMemory::build("Gotland", "{\"ok\":false}", 12, packet, size));
    assert(!packet && !size && live.empty());
  }
  assert(createWorker(worker, &task) == pdFAIL && taskCalls == 2 && !stack && !task);
  fail = false;
#else
  assert(createWorker(worker, &task) == pdFAIL && taskCalls == 0 && !task);
#endif
  for (int i = 0; i < 10; ++i) {
    {
      LiveSetupAllocator allocator;
      LiveSetupText response(responseBytes);
      assert(response.ok());
      JsonDocument parsed(&allocator), output(&allocator);
      assert(!deserializeJson(parsed, "{\"results\":[{\"title\":\"test\",\"content\":\"data\"}]}"));
      output["ok"] = true;
      output["results"] = parsed["results"];
      const size_t n = measureJson(output);
      LiveSetupText packet(resultBytes);
      assert(!output.overflowed() && n <= resultBytes);
      assert(serializeJson(output, packet.data(), resultBytes + 1) == n);
      assert(std::string(packet.c_str()).find("data") != std::string::npos);
    }
    assert(live.empty()); // Repeated search completion/cancellation must not leak.
  }
  fail = true;
  {
    LiveSetupText response(responseBytes);
    assert(!response.ok());
    LiveSetupAllocator allocator;
    JsonDocument doc(&allocator);
    doc["results"][0]["title"] = "test";
    assert(doc.overflowed()); // Never fall back to internal memory.
  }
  assert(live.empty());
}
''')
    for enabled in (0, 1):
        subprocess.run(['g++', '-std=c++17', '-DARDUINOJSON_ENABLE_ARDUINO_STRING=0',
                        f'-DCONFIG_FREERTOS_TASK_CREATE_ALLOW_EXT_MEM={enabled}',
                        '-I', str(tmp), '-I', str(ROOT / 'src'), '-I', str(json_include),
                        str(tmp / 'test.cpp'), '-o', str(tmp / 'test')], check=True)
        subprocess.run([str(tmp / 'test')], check=True)
print('Search PSRAM task/JSON/buffers, unsupported SDK, allocation failures and repeated cleanup passed')