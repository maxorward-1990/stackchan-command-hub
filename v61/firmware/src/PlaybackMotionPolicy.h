#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
#include "PerfPolicy.h"
namespace PlaybackMotionPolicy {
inline constexpr uint32_t prefillMs = 800;
inline constexpr size_t prefillSamples = 19200; // 0.8 s of 24 kHz PCM
// v37: start only on real buffered audio (0.4 s); time fallback is a 2 s safety net.
inline constexpr size_t minStartSamples = 9600;
inline constexpr uint32_t startSafetyMs = 2000;
inline constexpr uint32_t settleMs = 150;
inline constexpr uint32_t motionDeadlineMs = 15000;
inline constexpr size_t maxQueuedTools = 8;
inline constexpr size_t maxToolBytes = 16384;
inline bool motionTool(const char* name) {
  return !std::strcmp(name, "servo_gesture") || !std::strcmp(name, "head_motion");
}
inline const char* canonicalGesture(const char* name) {
  return !std::strcmp(name, "nod_once") ? "nod_yes" : name;
}
inline bool readyToPlay(size_t samples, uint32_t elapsed, bool complete, bool restart = false) {
  if (restart) return PerfPolicy::restartReady(samples, elapsed, complete);
  return samples > 0 && (samples >= minStartSamples || elapsed >= startSafetyMs || complete);
}
inline bool motionFinished(bool active, uint32_t settledFor) {
  return !active && settledFor >= settleMs;
}
inline bool canListen(bool motion, bool tools, bool audio, bool turnPending) {
  return !motion && !tools && !audio && !turnPending;
}
inline bool drainStalled(uint32_t now, uint32_t lastProgress) {
  return static_cast<uint32_t>(now - lastProgress) >= 5000;
}
struct DanceStep { int x, y, speed; uint16_t holdMs; };
inline constexpr DanceStep dance[] = {
  {-160,40,500,400}, {160,70,500,400}, {-160,20,500,400},
  {160,60,500,400}, {0,90,500,350}, {0,0,500,450}
};
}