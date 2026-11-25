"""Exercise staged adjustable WakeWord.cpp including v73 quantization regression."""
import ast
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STAGED = Path(sys.argv[1])
tree = ast.parse((ROOT / "tests/wake_word_lifecycle.py").read_text())
stub = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "STUB" for t in n.targets))
# Simulate a falsely successful setter too: readback must catch it.
stub = stub.replace("inline bool thresholdFails = false;", "inline bool thresholdFails = false, thresholdIgnored = false;")
stub = stub.replace("inline float configuredThreshold = 0.585f;", "inline float configuredThreshold = 0.585f, thresholdOffset = 0; inline bool invalidReadback = false;")
stub = stub.replace("configuredThreshold = value; return 1;", "if (!thresholdIgnored) configuredThreshold = invalidReadback ? __builtin_nanf(\"\") : value + thresholdOffset; return 1;")
TEST = r'''
#include "Arduino.h"
#include "WakeWord.h"
#include "Personality.h"
#include <cassert>
#include <cmath>
#include <initializer_list>
namespace Personality {
PersonalityPolicy::Settings settings;
const PersonalityPolicy::Settings& get() { return settings; }
}
int main() {
  using namespace WakeWordPolicy;
  assert(kDefaultThresholdMilli == 490);
  assert(Personality::settings.wakeThresholdMilli == 490);
  assert(validThresholdMilli(450) && validThresholdMilli(750));
  assert(!validThresholdMilli(449) && !validThresholdMilli(751));
  WakeWord::begin();
  assert(WakeWord::available() && creates == 0);
  // Real v72 failure: SDK succeeds but rounds 0.490 to 0.486.
  thresholdOffset = -0.004f;
  assert(!WakeWord::loop(true) && std::fabs(configuredThreshold - 0.486f) < 0.000001f);
  assert(WakeWord::listening() && allocations == 3);
  const int initialCreates = creates;
  for (int i = 0; i < 50; ++i) assert(!WakeWord::loop(true) && WakeWord::listening());
  assert(creates == initialCreates && destroys == 0);
  thresholdOffset = 0;
  int oldCreates = creates;
  Personality::settings.wakeThresholdMilli = 585;
  assert(!WakeWord::loop(true) && configuredThreshold == 0.585f);
  assert(creates == oldCreates + 1 && destroys == 1 && resets == 0);
  WakeWord::stop();
  for (float offset : {-0.020f, 0.020f}) {
    thresholdOffset = offset;
    assert(!WakeWord::loop(true) && WakeWord::listening());
    WakeWord::stop();
  }
  for (float offset : {-0.021f, 0.021f, -0.585f, 0.415f}) {
    thresholdOffset = offset;
    assert(!WakeWord::loop(true) && !resident && allocations == 0 && !M5.Mic.active);
  }
  thresholdOffset = 0; invalidReadback = true;
  assert(!WakeWord::loop(true) && !resident && allocations == 0 && !M5.Mic.active);
  invalidReadback = false;
  // No v64 peak rejection: even a quiet candidate takes the unchanged v61 path.
  M5.Mic.amplitude = 446;
  assert(!WakeWord::loop(true)); trigger = true;
  assert(WakeWord::loop(true));
  assert(!resident && allocations == 0 && !M5.Mic.active);
  trigger = false; M5.Mic.amplitude = 2000;
  thresholdFails = true;
  assert(!WakeWord::loop(true) && !resident && allocations == 0);
  thresholdFails = false; thresholdIgnored = true;
  Personality::settings.wakeThresholdMilli = 520;
  assert(!WakeWord::loop(true) && !resident && allocations == 0 && !M5.Mic.active);
  thresholdIgnored = false;
  for (int i = 0; i < 5; ++i) {
    assert(!WakeWord::loop(true) && configuredThreshold == 0.52f);
    trigger = true; assert(WakeWord::loop(true)); trigger = false;
    assert(!resident && allocations == 0 && !M5.Mic.active && resets == 0);
  }
  for (int i = 1; i <= 3; ++i) {
    failAllocAt = allocAttempts + i;
    assert(!WakeWord::loop(true) && !resident && allocations == 0);
  }
}
'''
with tempfile.TemporaryDirectory(prefix="wake-v73-test-") as temp:
    d = Path(temp)
    (d / "Arduino.h").write_text(stub)
    for name in ("M5Unified.h", "esp_heap_caps.h", "model_path.h", "esp_wn_iface.h", "esp_wn_models.h", "ArduinoJson.h", "FS.h"):
        (d / name).write_text('#pragma once\n#include "Arduino.h"\n')
    (d / "test.cpp").write_text(TEST)
    subprocess.run(["g++", "-std=c++17", "-I", str(d), "-I", str(STAGED / "src"), str(d / "test.cpp"), str(STAGED / "src/WakeWord.cpp"), "-o", str(d / "test")], check=True)
    subprocess.run([str(d / "test")], check=True)
print("v73: 0.490 -> 0.486 stays listening, bounded rounding, invalid/ignored SDK readback, safe idle reload, five detections and allocation failures passed")