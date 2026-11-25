#pragma once
// v77: bounded diagnostic mode. While active, conversation transcripts are not written to
// dialogue memory, so Command Hub's standard diagnosis (text turns and simulated voice) never
// pollutes the owner's history. It always expires on its own (max 15 min) even if the
// browser disappears; explicit stop ends it at once. Pure and host-tested.
#include <cstdint>

namespace DiagnosticModePolicy {
constexpr uint32_t kMaxSeconds = 900;

struct State {
  bool active = false;
  uint32_t untilMs = 0;
};

inline uint32_t clampSeconds(long seconds) {
  if (seconds < 1) return 1;
  if (seconds > static_cast<long>(kMaxSeconds)) return kMaxSeconds;
  return static_cast<uint32_t>(seconds);
}
inline void activate(State& s, uint32_t nowMs, long seconds) {
  s.active = true;
  s.untilMs = nowMs + clampSeconds(seconds) * 1000u;
}
inline void deactivate(State& s) { s.active = false; s.untilMs = 0; }
// Wrap-safe millis() comparison: valid across the 49-day rollover.
inline bool active(const State& s, uint32_t nowMs) {
  return s.active && static_cast<int32_t>(s.untilMs - nowMs) > 0;
}
inline uint32_t remainingMs(const State& s, uint32_t nowMs) {
  return active(s, nowMs) ? s.untilMs - nowMs : 0;
}
}  // namespace DiagnosticModePolicy
