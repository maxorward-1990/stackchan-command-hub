"""Compile the real WakeWord.cpp with host fakes; never invoke unsafe model reset."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STUB = r'''
#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstddef>
inline uint32_t clockMs = 100;
inline uint32_t millis() { return clockMs++; }
inline uint32_t micros() { return clockMs++ * 1000; }
inline void vTaskDelay(uint32_t n) { clockMs += n; }
#define pdMS_TO_TICKS(n) (n)
struct SerialFake {
  void println(const char*) {}
  template<class... T> void printf(const char*, T...) {}
};
inline SerialFake Serial;
class String {};
struct JsonVariantConst {};
struct JsonObject {};
namespace fs { class FS {}; }
struct MicFake {
  bool active = false, starts = true;
  int captured = 0, amplitude = 2000;
  bool begin() { active = starts; return active; }
  bool isRunning() { return active; }
  int isRecording() { return 0; }
  void end() { active = false; }
  bool record(int16_t* pcm, int n, int) {
    if (!active) return false;
    for (int i=0; i<n; ++i) pcm[i] = amplitude;
    ++captured; return true;
  }
};
struct SpeakerFake {
  bool playing = false, active = false;
  bool isPlaying() { return playing; }
  bool isRunning() { return active; }
  void end() { active = false; }
};
struct M5Fake { MicFake Mic; SpeakerFake Speaker; };
inline M5Fake M5;
#define MALLOC_CAP_INTERNAL 1
#define MALLOC_CAP_8BIT 2
#define MALLOC_CAP_SPIRAM 4
inline int allocations = 0, allocAttempts = 0, failAllocAt = 0;
inline size_t psramTotal = 8 * 1024 * 1024, psramFree = 100000;
inline size_t heap_caps_get_total_size(int) { return psramTotal; }
inline size_t heap_caps_get_free_size(int caps) { return (caps & MALLOC_CAP_SPIRAM) ? psramFree : 100000; }
inline size_t heap_caps_get_largest_free_block(int) { return 50000; }
inline void heap_caps_free(void* p) { if (p) { --allocations; free(p); } }
inline void* heap_caps_malloc(size_t size, int) {
  if (++allocAttempts == failAllocAt) return nullptr;
  void* p = malloc(size); if (p) ++allocations; return p;
}
struct srmodel_list_t {};
struct model_iface_data_t {};
enum wakenet_state_t { WAKENET_NO_DETECT, WAKENET_DETECTED };
inline constexpr int DET_MODE_95 = 1;
#define ESP_WN_PREFIX "wn"
struct esp_wn_iface_t {
  model_iface_data_t* (*create)(const char*, int);
  int (*get_samp_chunksize)(model_iface_data_t*);
  void (*destroy)(model_iface_data_t*);
  const char* (*get_word_name)(model_iface_data_t*, int);
  float (*get_det_threshold)(model_iface_data_t*, int);
  void (*clean)(model_iface_data_t*);
  wakenet_state_t (*detect)(model_iface_data_t*, int16_t*);
  int (*set_det_threshold)(model_iface_data_t*, float, int);
};
inline srmodel_list_t list;
inline model_iface_data_t data;
inline int resets = 0, detections = 0, creates = 0, destroys = 0;
inline bool createFails = false, resident = false;
inline bool trigger = false;
inline bool thresholdFails = false;
inline float configuredThreshold = 0.585f;
inline model_iface_data_t* create(const char*, int) { ++creates; if (createFails) return nullptr; if (resident) abort(); resident = true; return &data; }
inline int chunk(model_iface_data_t*) { return 512; }
inline void destroy(model_iface_data_t*) { if (!resident || M5.Mic.active) abort(); ++destroys; resident = false; }
inline const char* word(model_iface_data_t*, int) { return "Hi,Stack Chan"; }
inline float threshold(model_iface_data_t*, int) { return configuredThreshold; }
inline int setThreshold(model_iface_data_t*, float value, int) { if (thresholdFails) return 0; configuredThreshold = value; return 1; }
inline void unsafeReset(model_iface_data_t*) { ++resets; abort(); }
inline wakenet_state_t detect(model_iface_data_t*, int16_t* pcm) {
  if (pcm[0] != 2000 && pcm[0] != 446) abort();
  ++detections;
  return trigger ? WAKENET_DETECTED : WAKENET_NO_DETECT;
}
inline esp_wn_iface_t iface = {create, chunk, destroy, word, threshold, unsafeReset, detect, setThreshold};
inline srmodel_list_t* esp_srmodel_init(const char*) { return &list; }
inline char* esp_srmodel_filter(srmodel_list_t*, const char*, const char*) {
  static char name[] = "wn9_histackchan_tts3"; return name;
}
inline const esp_wn_iface_t* esp_wn_handle_from_name(const char*) { return &iface; }
'''
TEST = r'''
#include "Arduino.h"
#include "WakeWord.h"
#include "Personality.h"
#include <cassert>
namespace Personality {
PersonalityPolicy::Settings settings;
const PersonalityPolicy::Settings& get() { return settings; }
}
int main(int argc, char**) {
  if (argc > 1) {
    psramTotal = 0;
    WakeWord::begin();
    for (int i = 0; i < 20; ++i) assert(!WakeWord::loop(true));
    assert(!WakeWord::available() && creates == 0 && allocations == 0 && !M5.Mic.active);
    return 0;
  }
  WakeWord::begin();
  assert(WakeWord::available() && creates == 0 && allocations == 0);
  assert(!WakeWord::loop(false));
  assert(!WakeWord::listening() && M5.Mic.captured == 0);
  psramFree = 0;
  assert(!WakeWord::loop(true) && creates == 0 && allocations == 0 && !M5.Mic.active);
  psramFree = 100000;
  assert(!WakeWord::loop(true));
  assert(WakeWord::listening() && M5.Mic.captured == 2 && resets == 0);
  assert(configuredThreshold == 0.65f);
  assert(!WakeWord::loop(true));
  assert(detections == 2);
  WakeWord::stop();
  WakeWord::stop();
  assert(!WakeWord::listening() && !M5.Mic.active && !resident && allocations == 0);
  int before = detections;
  assert(!WakeWord::loop(true));
  assert(detections == before && WakeWord::listening() && resets == 0);
  trigger = true;
  assert(WakeWord::loop(true));
  assert(!WakeWord::listening() && !M5.Mic.active && !resident && allocations == 0);
  assert(WakeWord::available()); // suspended still eligible for idle restart
  trigger = false;
  assert(!WakeWord::loop(false));
  // Suspect low-signal candidate must not open a conversation, and must free all resources.
  M5.Mic.amplitude = 446;
  assert(!WakeWord::loop(true));
  trigger = true;
  assert(!WakeWord::loop(true));
  assert(!WakeWord::listening() && !resident && allocations == 0 && !M5.Mic.active);
  M5.Mic.amplitude = 2000; trigger = false;
  thresholdFails = true;
  assert(!WakeWord::loop(true) && !resident && allocations == 0);
  thresholdFails = false;
  assert(!WakeWord::loop(true));
  Personality::settings.wakeThresholdMilli = 700;
  assert(!WakeWord::loop(true) && configuredThreshold == 0.7f);
  WakeWord::stop();
  M5.Speaker.playing = true;
  assert(!WakeWord::loop(true) && !WakeWord::listening());
  M5.Speaker.playing = false;
  M5.Mic.starts = false;
  assert(!WakeWord::loop(true) && !WakeWord::listening());
  assert(WakeWord::lastFailureMs() != 0);
  M5.Mic.starts = true;
  assert(!WakeWord::loop(true) && WakeWord::listening() && resets == 0);
  WakeWord::stop();
  assert(!resident && allocations == 0);
  createFails = true;
  assert(!WakeWord::loop(true) && WakeWord::available() && allocations == 0);
  createFails = false;
  // Failure at each of the three PCM allocations must leave no partial buffers.
  for (int i = 1; i <= 3; ++i) {
    failAllocAt = allocAttempts + i;
    assert(!WakeWord::loop(true) && !resident && allocations == 0);
    assert(WakeWord::lastFailureMs() != 0 && WakeWord::available());
  }
  failAllocAt = 0;
  for (int i = 0; i < 5; ++i) {
    trigger = false;
    assert(!WakeWord::loop(true) && resident && allocations == 3);
    trigger = true;
    assert(WakeWord::loop(true) && !resident && allocations == 0);
  }
  assert(resets == 0);
}
'''
with tempfile.TemporaryDirectory(prefix="stackchan-wake-test-") as directory:
    d = Path(directory)
    (d / "Arduino.h").write_text(STUB)
    for name in ("M5Unified.h", "esp_heap_caps.h", "model_path.h", "esp_wn_iface.h", "esp_wn_models.h", "ArduinoJson.h", "FS.h"):
        (d / name).write_text('#pragma once\n#include "Arduino.h"\n')
    (d / "test.cpp").write_text(TEST)
    subprocess.run(["g++", "-std=c++17", "-I", str(d), "-I", str(ROOT / "src"),
                    str(d / "test.cpp"), str(ROOT / "src/WakeWord.cpp"), "-o", str(d / "test")], check=True)
    subprocess.run([str(d / "test")], check=True)
    subprocess.run([str(d / "test"), "missing-psram"], check=True)
assert "board_build.arduino.memory_type = qio_qspi" in (ROOT / "platformio.ini").read_text()
assert "board_build.arduino.memory_type = qio_qspi" in (ROOT / "platformio.v49-backup.ini").read_text()
print("WakeWord lifecycle: lazy load, release before conversation, five reloads, model/PCM/mic failures passed; reset never called")