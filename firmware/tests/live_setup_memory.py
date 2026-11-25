"""Compile the actual setup buffers/ArduinoJson allocator against a fake external heap."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
candidates = [ROOT / '.pio/libdeps/m5stack-cores3/ArduinoJson/src',
              Path('/tmp/fw53/.pio/libdeps/m5stack-cores3/ArduinoJson/src')]
json_include = next((p for p in candidates if p.exists()), None)
if json_include is None:
    raise SystemExit('Install firmware dependencies with PlatformIO before this test')

with tempfile.TemporaryDirectory(prefix='setup-memory-') as directory:
    tmp = Path(directory)
    (tmp / 'esp_heap_caps.h').write_text(r'''
#pragma once
#include <cstdlib>
#include <cassert>
#include <unordered_set>
constexpr int MALLOC_CAP_SPIRAM = 1;
constexpr int MALLOC_CAP_8BIT = 2;
inline bool fail = false;
inline size_t allocationCalls = 0;
inline std::unordered_set<void*> live;
inline void* heap_caps_malloc(size_t n, int caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  ++allocationCalls;
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
    (tmp / 'test.cpp').write_text(r'''
#include "LiveSetupMemory.h"
#include "LiveSetupPolicy.h"
#include <string>
int main() {
  {
    LiveSetupText text(4);
    text += "1234";
    assert(text.ok() && std::string(text.c_str()) == "1234");
    text += "5";
    assert(!text.ok() && std::string(text.c_str()) == "1234");
  }
  assert(live.empty());
  {
    LiveSetupAllocator allocator;
    JsonDocument doc(&allocator);
    LiveSetupText instruction(LiveSetupPolicy::instructionBytes);
    instruction += "Svenska: åäö, \"quoted\"\n";
    doc["setup"]["systemInstruction"]["parts"][0]["text"] = instruction.c_str();
    std::string history(2000, 'x');
    doc["history"] = history;
    const size_t n = measureJson(doc);
    assert(!doc.overflowed() && LiveSetupPolicy::validPacket(n));
    LiveSetupText packet(n);
    assert(serializeJson(doc, packet.data(), n + 1) == n);
    JsonDocument parsed;
    assert(!deserializeJson(parsed, packet.c_str()));
    assert(parsed["history"].as<std::string>() == history);
    assert(parsed["setup"]["systemInstruction"]["parts"][0]["text"].as<std::string>() == instruction.c_str());
    assert(allocationCalls > 0);
  }
  assert(live.empty());
  fail = true;
  {
    LiveSetupText text(20);
    text += "test";
    assert(!text.ok());
    LiveSetupAllocator allocator;
    JsonDocument doc(&allocator);
    doc["setup"]["model"] = "test";
    assert(doc.overflowed());
  }
  assert(live.empty());
}
''')
    subprocess.run(['g++', '-std=c++17', '-DARDUINOJSON_ENABLE_ARDUINO_STRING=0',
                    '-I', str(tmp), '-I', str(ROOT / 'src'), '-I', str(json_include),
                    str(tmp / 'test.cpp'), '-o', str(tmp / 'test')], check=True)
    subprocess.run([str(tmp / 'test')], check=True)
print('Live setup PSRAM allocation, bounds, JSON round-trip and failure cleanup passed')