#pragma once
#include <stdint.h>
#include <stddef.h>

// A low largest block alone is not evidence of a leak. Never compact/reboot.
namespace IdleMemoryPolicy {
constexpr size_t minLargest = 8 * 1024;
constexpr size_t minFree = 20 * 1024;
constexpr uint32_t sustainedMs = 5000;
constexpr uint32_t cooldownMs = 300000;
constexpr uint32_t releaseMs = 2000;
class Guard {
 public:
  bool poll(uint32_t now, bool idle, size_t freeBytes, size_t largest) {
    if (!idle || (freeBytes >= minFree && largest >= minLargest)) {
      tracking_ = false; return false;
    }
    if (acted_ && uint32_t(now - lastAction_) < cooldownMs) return false;
    if (!tracking_) { tracking_ = true; lowSince_ = now; return false; }
    if (uint32_t(now - lowSince_) < sustainedMs) return false;
    acted_ = true; lastAction_ = now; tracking_ = false; return true;
  }
  bool pauseWake(uint32_t now) const {
    return acted_ && uint32_t(now - lastAction_) < releaseMs;
  }
 private:
  bool tracking_ = false, acted_ = false;
  uint32_t lowSince_ = 0, lastAction_ = 0;
};
}