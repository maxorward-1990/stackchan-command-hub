#include "WakeWord.h"
#include "AudioDiagnostics.h"
#include "SpeechPolicy.h"
#include <M5Unified.h>
#include <mbedtls/base64.h>
namespace AudioDiagnostics {
static int16_t* pcm = nullptr;
static size_t captured = 0;
static uint32_t captureId = 0, queuedAt = 0, retainedAt = 0;
static bool recording = false, pending = false, ready = false;
static String error;
static uint16_t peak = 0;
static uint32_t clipped = 0;
static uint64_t squareSum = 0;
static constexpr size_t blockSamples = 2000;
static void endMic() {
  uint32_t start = millis();
  while (M5.Mic.isRecording() && millis() - start < 1500) vTaskDelay(pdMS_TO_TICKS(5));
  vTaskDelay(pdMS_TO_TICKS(20));
  M5.Mic.end();
}
void readyCue(uint8_t volume) {
  // The CoreS3 is half duplex: finish the cue BEFORE opening the microphone.
  // No tone during the network handshake; successful capture is the final
  // readiness indication. Keep this handoff short, not a long wake melody.
  static int16_t cue[1280];
  for (size_t i = 0; i < 1280; ++i) {
    float t = static_cast<float>(i) / 16000.0f;
    cue[i] = static_cast<int16_t>(5000.0f * sinf(3.14159265f * i / 1280) * sinf(2 * 3.14159265f * 1100 * t));
  }
  M5.Speaker.begin();
  M5.Speaker.setVolume(volume);
  M5.Speaker.setAllChannelVolume(volume);
  M5.Speaker.playRaw(cue, 1280, 16000, false, 1, 0, false);
  uint32_t start = millis();
  while (M5.Speaker.isPlaying(0) && millis() - start < 160) vTaskDelay(pdMS_TO_TICKS(2));
  M5.Speaker.stop(0);
  M5.Speaker.end();
}
bool busy() { return recording; }
void clear() {
  if (recording || pending) endMic();
  recording = pending = ready = false;
  free(pcm); pcm = nullptr; captured = 0; retainedAt = 0;
}
bool start() {
  if (busy()) return false;
  clear(); error = ""; peak = 0; clipped = 0; squareSum = 0;
  pcm = static_cast<int16_t*>(ps_malloc(SpeechPolicy::pcmBytes));
  if (!pcm) { error = "audio_test_no_psram"; return false; }
  ++captureId;
  readyCue(M5.Speaker.getVolume());
  WakeWord::stop();  // v50: wake word must release the shared mic
  if (!M5.Mic.begin()) { error = "audio_test_mic_start_failed"; clear(); return false; }
  if (!M5.Mic.record(pcm, blockSamples, SpeechPolicy::sampleRate)) {
    error = "audio_test_capture_failed"; endMic(); clear(); return false;
  }
  recording = pending = true; queuedAt = millis();
  Serial.printf("[LJUDTEST] id=%u recording 3s locally; not sent to Gemini\n", static_cast<unsigned>(captureId));
  return true;
}
void loop() {
  if (!recording) {
    if (retainedAt && millis() - retainedAt > 120000) clear();
    return;
  }
  if (pending && M5.Mic.isRecording()) {
    if (millis() - queuedAt > SpeechPolicy::captureTimeoutMs) {
      error = "audio_test_capture_timeout"; clear();
    }
    return;
  }
  if (pending) {
    for (size_t i = captured; i < captured + blockSamples; ++i) {
      int32_t value = pcm[i]; uint32_t absValue = value < 0 ? -value : value;
      peak = absValue > peak ? absValue : peak;
      if (absValue >= 32700) ++clipped;
      squareSum += static_cast<int64_t>(value) * value;
    }
    captured += blockSamples; pending = false;
  }
  if (captured == SpeechPolicy::samples) {
    endMic(); recording = false; ready = true; retainedAt = millis();
    Serial.printf("[LJUDTEST] id=%u ready bytes=%u peak=%u clipped=%u\n", static_cast<unsigned>(captureId), static_cast<unsigned>(SpeechPolicy::pcmBytes), peak, static_cast<unsigned>(clipped));
    return;
  }
  if (!M5.Mic.record(pcm + captured, blockSamples, SpeechPolicy::sampleRate)) {
    error = "audio_test_capture_failed"; clear(); return;
  }
  pending = true; queuedAt = millis();
}
void status(JsonDocument& out) {
  out["ok"] = error.isEmpty(); out["id"] = captureId;
  out["state"] = recording ? "recording" : ready ? "ready" : error.length() ? "error" : "idle";
  out["error"] = error; out["sample_rate"] = SpeechPolicy::sampleRate;
  out["pcm_bytes"] = ready ? SpeechPolicy::pcmBytes : 0;
  out["captured_ms"] = captured * 1000 / SpeechPolicy::sampleRate;
  out["peak"] = peak; out["clipped_samples"] = clipped;
  out["rms"] = captured ? static_cast<uint32_t>(sqrt(static_cast<double>(squareSum / captured))) : 0;
  out["mic_magnification"] = M5.Mic.config().magnification;
  out["mic_noise_filter_level"] = M5.Mic.config().noise_filter_level;
}
bool chunk(uint32_t id, size_t offset, size_t count, JsonDocument& out) {
  if (!ready || !pcm || id != captureId || !SpeechPolicy::chunkFits(offset, count, SpeechPolicy::pcmBytes)) return false;
  unsigned char b64[1025]; size_t size = 0;
  if (mbedtls_base64_encode(b64, sizeof b64, &size, reinterpret_cast<const uint8_t*>(pcm) + offset, count)) return false;
  b64[size] = 0; out["ok"] = true; out["id"] = id; out["offset"] = offset;
  out["data"] = reinterpret_cast<const char*>(b64); retainedAt = millis(); return true;
}
}