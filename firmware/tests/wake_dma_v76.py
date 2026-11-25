"""Run the actual staged main-loop wake gate with real WakeWord.cpp and host fakes."""
import ast
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STAGED = Path(sys.argv[1])
tree = ast.parse((ROOT / "tests/wake_word_lifecycle.py").read_text())
stub = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "STUB" for t in n.targets))
stub = stub.replace("#define MALLOC_CAP_INTERNAL 1", "#define MALLOC_CAP_DMA 8\n#define MALLOC_CAP_INTERNAL 1")
stub = stub.replace("inline size_t heap_caps_get_largest_free_block(int) { return 50000; }", "inline size_t dmaLargest = 50000;\ninline size_t heap_caps_get_largest_free_block(int caps) { return (caps & MALLOC_CAP_DMA) ? dmaLargest : 50000; }")
main = (STAGED / "src/main.cpp").read_text()
start = main.index("    w.search = WebResearch::busy();") if "    w.search = WebResearch::busy();" in main else main.index("    w.search = WebResearch::busy() ||")
end = main.index("\n", main.index("w.search = true;", start))
gate = main[start:end]
test = r'''
#include "Arduino.h"
#include "WakeWord.h"
#include "Personality.h"
#include <cassert>
namespace Personality {
PersonalityPolicy::Settings settings;
const PersonalityPolicy::Settings& get() { return settings; }
}
namespace WebResearch { bool active = false; bool busy() { return active; } }
namespace SmartHome { bool active = false; bool busy() { return active; } }
namespace InternetVisual { bool active = false; bool busy() { return active; } }
bool step() {
  struct { bool search = false; } w;
GATE
  return WakeWord::loop(!w.search);
}
int main() {
  WakeWord::begin();
  // Cold starts remain blocked below 8 KiB; the boundary allows starting.
  dmaLargest = 8191;
  for (int i = 0; i < 100; ++i) assert(!step() && creates == 0 && !M5.Mic.active);
  dmaLargest = 8192;
  assert(!step() && WakeWord::listening() && creates == 1);
  // Own model allocations or settings requests must not unload/reload the listener.
  dmaLargest = 2036;
  for (int i = 0; i < 1000; ++i) assert(!step() && WakeWord::listening());
  assert(creates == 1 && destroys == 0);
  // Accepting 0.450 changes the model exactly once, even under reduced free DMA.
  Personality::settings.wakeThresholdMilli = 450;
  assert(!step() && WakeWord::listening() && configuredThreshold == 0.450f);
  for (int i = 0; i < 1000; ++i) assert(!step() && WakeWord::listening());
  assert(creates == 2 && destroys == 1 && resets == 0);
  // Network ownership still pauses listening, including a cancelled Tuya worker.
  for (bool* busy : {&SmartHome::active, &WebResearch::active, &InternetVisual::active}) {
    *busy = true;
    assert(!step() && !WakeWord::listening() && !resident && !M5.Mic.active);
    *busy = false;
    const int before = creates;
    for (int i = 0; i < 100; ++i) assert(!step() && creates == before);
    dmaLargest = 8192;
    assert(!step() && WakeWord::listening() && creates == before + 1);
    dmaLargest = 2036;
  }
  trigger = true;
  assert(step() && !resident && !M5.Mic.active);
}
'''.replace("GATE", gate).replace('#include <cassert>', '#include <cassert>\n#include <initializer_list>')
with tempfile.TemporaryDirectory(prefix="wake-dma-v76-") as temp:
    d = Path(temp)
    (d / "Arduino.h").write_text(stub)
    for name in ("M5Unified.h", "esp_heap_caps.h", "model_path.h", "esp_wn_iface.h", "esp_wn_models.h", "ArduinoJson.h", "FS.h"):
        (d / name).write_text('#pragma once\n#include "Arduino.h"\n')
    (d / "test.cpp").write_text(test)
    subprocess.run(["g++", "-std=c++17", "-I", str(d), "-I", str(STAGED / "src"), str(d / "test.cpp"), str(STAGED / "src/WakeWord.cpp"), "-o", str(d / "test")], check=True)
    subprocess.run([str(d / "test")], check=True)
print("v76: cold-start DMA boundary, no active-listener oscillation, 0.450 reload and network-worker gates passed")