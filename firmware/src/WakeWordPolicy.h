#pragma once
// v50: pure, tested gate for the local "Hi Stack Chan" wake word. The microphone is
// half-duplex with the speaker and shared with Gemini/diagnostics, so the wake word may
// only listen when the robot is otherwise silent and idle.
#include <cstdint>
#include <cstddef>

namespace WakeWordPolicy {
constexpr uint32_t kQuietAfterConversationMs = 1500; // let speaker/I2S settle after a session
constexpr uint32_t kRetryAfterFailureMs = 30000;     // mic/model start failure backoff
constexpr uint16_t kDefaultMinPeak = 1500;
constexpr uint16_t kDefaultThresholdMilli = 650;
constexpr uint32_t kEvidenceSamples = 16000; // one second of completed PCM, no audio retained
inline bool validMinPeak(long v) { return v >= 0 && v <= 32767; }
inline bool validThresholdMilli(long v) { return v >= 400 && v <= 950; }
// Fixed-size peak envelope preserves loud syllables before a quiet detection tail.
struct Evidence {
  uint16_t peaks[32] = {};
  uint32_t ages[32] = {};
  uint8_t next = 0;
  void reset() { *this = Evidence{}; }
  uint16_t add(uint16_t peak, uint32_t samples) {
    for (uint8_t i = 0; i < 32; ++i) {
      ages[i] = ages[i] >= kEvidenceSamples || samples >= kEvidenceSamples - ages[i]
        ? kEvidenceSamples : ages[i] + samples;
      if (ages[i] >= kEvidenceSamples) peaks[i] = 0;
    }
    peaks[next] = peak; ages[next] = 0; next = (next + 1) % 32;
    uint16_t maximum = 0;
    for (uint16_t p : peaks) if (p > maximum) maximum = p;
    return maximum;
  }
};
inline bool acceptCandidate(uint16_t recentPeak, uint16_t minimum) { return recentPeak > minimum; }
inline bool hasExternalMemory(size_t bytes) { return bytes > 0; }

struct Inputs {
  bool enabled = false;        // personality wake_word (default off)
  bool modelReady = false;     // model partition loaded
  bool recording = false;      // Gemini owns the mic
  bool speaking = false;       // robot speaking / speaker playing
  bool conversation = false;   // continuous conversation or pending tool/reply
  bool camera = false;         // live camera stream
  bool menu = false;           // on-device touch menu
  bool diagnostics = false;    // audio test / stereo probe
  bool search = false;         // Tavily needs WakeNet's internal memory for TLS
  uint32_t sinceConversationEndMs = 0xFFFFFFFFu;
  uint32_t sinceFailureMs = 0xFFFFFFFFu;
};

inline bool mayListen(const Inputs& in) {
  if (!in.enabled || !in.modelReady) return false;
  if (in.recording || in.speaking || in.conversation || in.camera || in.menu || in.diagnostics || in.search) return false;
  if (in.sinceConversationEndMs < kQuietAfterConversationMs) return false;
  return in.sinceFailureMs >= kRetryAfterFailureMs;
}
}
