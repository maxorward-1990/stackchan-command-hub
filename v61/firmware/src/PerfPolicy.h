#pragma once
#include <cstdint>
#include <cstddef>
namespace PerfPolicy {
inline constexpr uint32_t intervalMs = 1000;
inline constexpr uint32_t speakingFrameMs = 90;
inline constexpr uint32_t restartMs = 120;
inline constexpr uint32_t restartSamples = 2880;
// Tick occupancy is a sampled estimate, not task runtime accounting.
inline int sampledBusy(uint32_t idle, uint32_t ticks) {
  if (!ticks || idle > ticks) return -1;
  return static_cast<int>((static_cast<uint64_t>(ticks - idle) * 100) / ticks);
}
inline bool restartReady(size_t samples, uint32_t elapsed, bool complete) {
  return samples > 0 && (samples >= restartSamples || elapsed >= restartMs || complete);
}
struct Metric {
  uint32_t maximum = 0, count = 0;
  void add(uint32_t us) { if (us > maximum) maximum = us; ++count; }
};
}