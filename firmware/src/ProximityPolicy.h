#pragma once
#include <cstdint>
#include "TalkTouchPolicy.h"
// One-point proximity, not directional gestures. No allocation or I/O.
namespace ProximityPolicy {
constexpr uint32_t kPollMs = 50, kMinNearMs = 80;
constexpr uint32_t kLongMs = 1000, kFarMs = 150, kCooldownMs = 800, kMaxGapMs = 250;
constexpr uint16_t kMinThreshold = 5, kMaxThreshold = 2047, kDefaultThreshold = 100;
// Lite-On DS86-2013-0005 pp.14–19: 60 kHz, 100% pulse duty, 100 mA peak,
// eight pulses at 50 ms. Duty is within a pulse burst, NOT continuously on.
constexpr uint8_t kPsLed = 0x7F, kPsPulses = 8, kPsRate = 0x00;
constexpr uint8_t kPsControl = 0x22; // enable saturation flag, x16 gain, active
constexpr uint8_t kAlsControl = 0x19, kAlsRate = 0x12; // x48, 200 ms integration/repeat
constexpr uint16_t kAlsGain = 48, kAlsIntegrationMs = 200;
constexpr uint32_t kPsReadyMs = 150, kAlsReadyMs = 300;
inline bool validThreshold(long v) { return v >= kMinThreshold && v <= kMaxThreshold; }
// Standard LTR553 channel-ratio coefficients; no invented front-glass multiplier.
// This estimates illuminance AT THE SENSOR, not calibrated room illuminance.
inline float estimatedLux(uint16_t ch0, uint16_t ch1, uint16_t gain, uint16_t integrationMs) {
  const uint32_t total = uint32_t(ch0) + ch1;
  if (!total || !gain || !integrationMs) return 0;
  const float ratio = float(ch1) / total;
  float value = 0;
  if (ratio < 0.45f) value = 1.7743f * ch0 + 1.1059f * ch1;
  else if (ratio < 0.68f) value = 4.2785f * ch0 - 1.9548f * ch1;
  else if (ratio < 0.99f) value = 0.5926f * ch0 + 0.1185f * ch1;
  return value > 0 ? value * 100.0f / (gain * float(integrationMs)) : 0;
}
inline TalkTouchPolicy::Action action(bool longHold, bool conversation, bool interrupt, bool recording) {
  if (longHold) return conversation || interrupt ? TalkTouchPolicy::Action::EndConversation : TalkTouchPolicy::Action::None;
  return TalkTouchPolicy::onTap(conversation, interrupt, recording);
}
enum class Event { None, Tap, Hold };
struct Detector {
  bool armed = false, near = false, consumed = false, farTiming = false, sampled = false;
  uint32_t farSince = 0, nearSince = 0, lastSample = 0, cooldownSince = 0;
  bool cooling = false;
  void reset() { *this = Detector{}; }
  Event poll(uint32_t now, bool allowed, bool valid, uint16_t raw, uint16_t threshold) {
    if (!allowed || !valid || !validThreshold(threshold)) { reset(); return Event::None; }
    if (sampled && uint32_t(now - lastSample) > kMaxGapMs) reset();
    sampled = true; lastSample = now;
    const uint16_t release = threshold * 3u / 4u;
    if (cooling && uint32_t(now - cooldownSince) >= kCooldownMs) cooling = false;
    if (raw <= release) {
      Event event = Event::None;
      if (near) {
        const uint32_t duration = now - nearSince;
        // No ambiguity band: a released hand below the hold boundary is a tap.
        if (!consumed && duration >= kMinNearMs && duration < kLongMs) event = Event::Tap;
        near = false; consumed = false; armed = false;
        cooling = true; cooldownSince = now;
      }
      if (!farTiming) { farTiming = true; farSince = now; }
      if (!cooling && uint32_t(now - farSince) >= kFarMs) armed = true;
      return event;
    }
    farTiming = false;
    if (!near && armed && !cooling && raw >= threshold) {
      near = true; armed = false; nearSince = now; consumed = false;
    }
    if (near && !consumed && uint32_t(now - nearSince) >= kLongMs) {
      consumed = true;
      return Event::Hold;
    }
    return Event::None;
  }
};
}