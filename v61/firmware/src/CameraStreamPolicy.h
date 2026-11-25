#pragma once
// Pure rules for the live camera (surveillance) stream. Tested in tests/camera_stream_policy.cpp.
#include <cstdint>

namespace CameraStreamPolicy {
inline constexpr uint16_t kPort = 81;
inline constexpr uint32_t kMinFrameIntervalMs = 100;      // cap ~10 fps (GC0308 has no hardware JPEG)
inline constexpr uint32_t kMaxSessionMs = 10UL * 60UL * 1000UL;  // privacy: auto-stop after 10 min
inline constexpr int kJpegQuality = 60;
inline constexpr uint8_t kMaxFrameFailures = 5;

// Only one viewer at a time and never while a voice turn owns audio/CPU.
inline bool canStart(bool alreadyStreaming, bool voiceBusy) { return !alreadyStreaming && !voiceBusy; }
// Wait this long before grabbing the next frame.
inline uint32_t waitBeforeNextFrame(uint32_t sinceLastFrameMs) {
  return sinceLastFrameMs >= kMinFrameIntervalMs ? 0 : kMinFrameIntervalMs - sinceLastFrameMs;
}
inline bool shouldStop(uint32_t sessionMs, uint8_t consecutiveFailures, bool stopRequested) {
  return stopRequested || sessionMs >= kMaxSessionMs || consecutiveFailures >= kMaxFrameFailures;
}
}  // namespace CameraStreamPolicy
