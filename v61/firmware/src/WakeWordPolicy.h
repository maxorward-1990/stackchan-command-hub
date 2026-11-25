#pragma once
// v50: pure, tested gate for the local "Hi Stack Chan" wake word. The microphone is
// half-duplex with the speaker and shared with Gemini/diagnostics, so the wake word may
// only listen when the robot is otherwise silent and idle.
#include <cstdint>
#include <cstddef>

namespace WakeWordPolicy {
constexpr uint32_t kQuietAfterConversationMs = 1500; // let speaker/I2S settle after a session
constexpr uint32_t kRetryAfterFailureMs = 30000;     // mic/model start failure backoff
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
