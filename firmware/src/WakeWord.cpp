#include "WakeWord.h"
#include "WakeWordPolicy.h"
#include "Personality.h"
#include <Arduino.h>
#include <M5Unified.h>
#include <esp_heap_caps.h>
extern "C" {
#include "model_path.h"
#include "esp_wn_iface.h"
#include "esp_wn_models.h"
}

namespace WakeWord {
namespace {
srmodel_list_t* models = nullptr;
const esp_wn_iface_t* wn = nullptr;
model_iface_data_t* wnData = nullptr;
char* modelName = nullptr;
int chunk = 0;
constexpr int kBufs = 3;
int16_t* bufs[kBufs] = {};
int head = 0, pending = 0;
bool running = false;
uint32_t failMs = 0, startedMs = 0;
WakeWordPolicy::Evidence evidence;
uint16_t appliedThresholdMilli = 0;

void release() {
  uint32_t t0 = millis();
  while (M5.Mic.isRecording() && millis() - t0 < 300) vTaskDelay(pdMS_TO_TICKS(5));
  if (M5.Mic.isRunning()) M5.Mic.end();
  head = pending = 0;
  running = false;
  evidence.reset();
}
void memoryLog(const char* phase) {
  Serial.printf("[WAKE] memory phase=%s internal_free=%u internal_largest=%u psram_free=%u\n", phase,
    static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
    static_cast<unsigned>(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
    static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)));
}

void unload() {
  if (wnData) { wn->destroy(wnData); wnData = nullptr; }
  for (auto& buf : bufs) { if (buf) heap_caps_free(buf); buf = nullptr; }
  chunk = 0;
  appliedThresholdMilli = 0;
}

bool load() {
  memoryLog("before_create");
  if (!WakeWordPolicy::hasExternalMemory(heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT))) {
    failMs = millis() | 1;
    Serial.println("[WAKE] start blocked: no free PSRAM (retry after 30s)");
    return false;
  }
  // This bundled SDK documents DET_MODE_90 as flash-only for WakeNet10.
  // Keep WakeNet9's proven PSRAM mode; tune the actual threshold instead.
  wnData = wn->create(modelName, DET_MODE_95);
  if (wnData) {
    appliedThresholdMilli = Personality::get().wakeThresholdMilli;
    if (wn->set_det_threshold(wnData, appliedThresholdMilli / 1000.0f, 1) != 1) {
      unload(); failMs = millis() | 1;
      Serial.println("[WAKE] threshold configuration failed; start blocked");
      return false;
    }
    chunk = wn->get_samp_chunksize(wnData);
    if (chunk > 0 && chunk <= 4096) {
      for (auto& buf : bufs) {
        buf = static_cast<int16_t*>(heap_caps_malloc(chunk * sizeof(int16_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
        if (!buf) break;
      }
      if (bufs[kBufs - 1]) {
        Serial.printf("[WAKE] ready model=%s word=%s chunk=%d threshold=%.3f\n", modelName,
          wn->get_word_name(wnData, 1), chunk, wn->get_det_threshold(wnData, 1));
        memoryLog("loaded");
        return true;
      }
    }
  }
  unload();
  failMs = millis() | 1;
  Serial.println("[WAKE] model/buffer allocation failed (retry after 30s)");
  memoryLog("create_failed");
  return false;
}
}

void begin() {
  if (models) return;
  const size_t psramTotal = heap_caps_get_total_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  Serial.printf("[WAKE] psram_total=%u memory_mode=qio_qspi\n", static_cast<unsigned>(psramTotal));
  if (!WakeWordPolicy::hasExternalMemory(psramTotal)) {
    Serial.println("[WAKE] disabled for this boot: PSRAM unavailable; model creation blocked");
    return;
  }
  models = esp_srmodel_init("model");
  modelName = models ? esp_srmodel_filter(models, ESP_WN_PREFIX, "histackchan") : nullptr;
  wn = modelName ? esp_wn_handle_from_name(modelName) : nullptr;
  if (!wn) { Serial.println("[WAKE] model unavailable (flash the v50 wake-word model)"); return; }
  Serial.printf("[WAKE] discovered model=%s (load only while idle)\n", modelName);
  memoryLog("discovered");
}

bool available() { return wn != nullptr && modelName != nullptr; }

bool listening() { return running; }
uint32_t lastFailureMs() { return failMs; }
void stop() {
  const bool hadModel = wnData != nullptr;
  if (running) release();
  unload();
  if (hadModel) { Serial.println("[WAKE] paused; model released"); memoryLog("released"); }
}

bool loop(bool mayListen) {
  if (!available()) return false;
  if (!mayListen) { stop(); return false; }
  if (wnData && appliedThresholdMilli != Personality::get().wakeThresholdMilli) stop();
  if (!running) {
    if (M5.Speaker.isPlaying()) return false;
    if (M5.Speaker.isRunning()) M5.Speaker.end();
    if (!wnData && !load()) return false;
    if (!M5.Mic.begin()) { stop(); failMs = millis() | 1; Serial.println("[WAKE] mic start failed"); return false; }
    // Do not call WakeNet clean(): this bundled histackchan model crashes in
    // its reset implementation (v50 LoadProhibited). The model
    // instance is recreated after pauses; completed captures below are always fresh.
    running = true; startedMs = millis();
    Serial.println("[WAKE] listening for \"Hi Stack Chan\"");
  }
  // Keep two captures queued; isRecording() reports how many are still pending.
  while (pending > 0 && static_cast<int>(M5.Mic.isRecording()) < pending) {
    int16_t* pcm = bufs[head];
    head = (head + 1) % kBufs; --pending;
    uint16_t peak = 0;
    for (int i = 0; i < chunk; ++i) {
      int v = pcm[i]; if (v < 0) v = -v;
      if (v > peak) peak = static_cast<uint16_t>(v);
    }
    const uint16_t recentPeak = evidence.add(peak, chunk);
    uint32_t t0 = micros();
    wakenet_state_t r = wn->detect(wnData, pcm);
    uint32_t detectUs = micros() - t0;
    if (r == WAKENET_DETECTED) {
      const uint16_t minimum = Personality::get().wakeMinPeak;
      if (!WakeWordPolicy::acceptCandidate(recentPeak, minimum)) {
        Serial.printf("[WAKE] rejected reason=low_signal peak=%u recent_peak=%u min_peak=%u threshold=%.3f\n",
          peak, recentPeak, minimum, wn->get_det_threshold(wnData, 1));
        // Destroy, never clean/reset the histackchan model. No Gemini connection.
        stop();
        return false;
      }
      uint32_t d0 = millis();
      release();
      Serial.printf("[WAKE] detected word=%s threshold=%.3f detect_us=%lu peak=%u recent_peak=%u min_peak=%u listened_ms=%lu release_ms=%lu\n",
                    wn->get_word_name(wnData, 1), wn->get_det_threshold(wnData, 1), static_cast<unsigned long>(detectUs), peak,
                    recentPeak, minimum,
                    static_cast<unsigned long>(d0 - startedMs), static_cast<unsigned long>(millis() - d0));
      stop(); // free active model before caller starts Gemini TLS
      return true;
    }
  }
  while (pending < 2) {
    int idx = (head + pending) % kBufs;
    if (!M5.Mic.record(bufs[idx], chunk, 16000)) break;
    ++pending;
  }
  return false;
}
}
