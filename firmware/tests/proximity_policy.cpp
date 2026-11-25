#include "../src/ProximityPolicy.h"
#include "../src/PersonalityPolicy.h"
#include <cassert>
#include <initializer_list>
#include <cmath>
using namespace ProximityPolicy;
using Action = TalkTouchPolicy::Action;
static Event sample(Detector& d, uint32_t t, uint16_t raw = 0, bool valid = true, bool allowed = true) {
  return d.poll(t, allowed, valid, raw, 1800);
}
static void arm(Detector& d, uint32_t start = 0) {
  for (uint32_t t = start; t <= start + 150; t += 50) assert(sample(d, t) == Event::None);
  assert(d.armed);
}
static void nearUntil(Detector& d, uint32_t start, uint32_t duration) {
  for (uint32_t t = start; t <= start + duration; t += 50) assert(sample(d, t, 1900) == Event::None);
}
int main() {
  // Opt-in preserves existing touch/wake settings for old personality files.
  PersonalityPolicy::Settings defaults;
  assert(!defaults.proximityControl && defaults.proximityThreshold == 100);
  assert(kDefaultThreshold == defaults.proximityThreshold);
  assert(validThreshold(5) && validThreshold(2047));
  assert(!validThreshold(4) && !validThreshold(2048));
  // The user's observed raw 14 can now cross a saved low threshold of 10.
  Detector low;
  for (uint32_t t = 0; t <= 150; t += 50) low.poll(t, true, true, 0, 10);
  assert(low.poll(200, true, true, 14, 10) == Event::None);
  assert(low.poll(250, true, true, 14, 10) == Event::None);
  assert(low.poll(300, true, true, 0, 10) == Event::Tap);
  // Lux normalization must compensate gain AND integration, not just inflate raw counts.
  assert(std::fabs(estimatedLux(1000, 200, 48, 200) - 20.78625f) < 0.001f);
  assert(std::fabs(estimatedLux(1000, 200, 48, 100) - 41.5725f) < 0.001f);
  assert(std::fabs(estimatedLux(1000, 1000, 48, 200) - 24.2052f) < 0.001f);
  assert(std::fabs(estimatedLux(200, 800, 48, 200) - 2.2221f) < 0.001f);
  assert(estimatedLux(0, 1000, 48, 200) == 0);
  assert(estimatedLux(0, 0, 48, 200) == 0);
  assert(estimatedLux(1, 1, 0, 200) == 0);
  // Short hand gestures use exactly the touch action, for every voice state.
  assert(action(false, false, false, false) == Action::Start);
  assert(action(false, true, false, true) == Action::SendTurn);
  assert(action(false, true, false, false) == Action::SendTurn); // thinking/startup
  assert(action(false, true, true, false) == Action::Interrupt);
  // Long holds stop active chat but never start a chat or open an idle menu.
  assert(action(true, true, false, true) == Action::EndConversation);
  assert(action(true, false, true, false) == Action::EndConversation);
  assert(action(true, false, false, false) == Action::None);
  for (uint32_t duration : {100u, 300u, 500u, 550u, 900u, 950u}) {
    Detector d; arm(d); nearUntil(d, 200, duration - 50);
    assert(sample(d, 200 + duration) == Event::Tap);
    assert(sample(d, 250 + duration) == Event::None);
  }
  // Very short noise still does nothing; there is no 0.5–1 s dead zone.
  for (uint32_t duration : {50u}) {
    Detector d; arm(d); nearUntil(d, 200, duration - 50);
    assert(sample(d, 200 + duration) == Event::None);
  }
  Detector boundary; arm(boundary);
  assert(sample(boundary, 200, 1900) == Event::None);
  assert(sample(boundary, 279) == Event::None);
  Detector accepted; arm(accepted);
  assert(sample(accepted, 200, 1900) == Event::None);
  assert(sample(accepted, 280) == Event::Tap);
  // At 1 s a hold fires once, without waiting for the hand to leave.
  Detector d; arm(d); nearUntil(d, 200, 950);
  assert(sample(d, 1200, 1900) == Event::Hold);
  for (uint32_t t = 1250; t <= 2000; t += 50) assert(sample(d, t, 1900) == Event::None);
  assert(sample(d, 2050) == Event::None); // release cannot produce a short tap
  // Cooldown and stable far readings prevent repeated triggers.
  for (uint32_t t = 2100; t <= 2800; t += 50) assert(sample(d, t, 1900) == Event::None);
  assert(!d.armed);
  arm(d, 2850); assert(d.armed);
  // Must see clear space first; enabling under a stationary hand does nothing.
  Detector covered;
  for (uint32_t t = 0; t < 2000; t += 50) assert(sample(covered, t, 1900) == Event::None);
  // Hysteresis tolerates fluctuating readings without repeated gesture edges.
  Detector h; arm(h); assert(sample(h, 200, 1900) == Event::None);
  assert(sample(h, 250, 1600) == Event::None);
  assert(sample(h, 300, 1700) == Event::None);
  assert(sample(h, 350, 1300) == Event::Tap);
  // Invalid samples, conflicting touch/menu/camera/diagnostics or long loop gaps cancel.
  for (int failure = 0; failure < 3; ++failure) {
    Detector f; arm(f); nearUntil(f, 200, 150);
    if (failure == 0) sample(f, 400, 1900, false);
    if (failure == 1) sample(f, 400, 1900, true, false);
    if (failure == 2) sample(f, 700, 1900);
    assert(sample(f, 750, 0) == Event::None);
    assert(!f.armed);
  }
  // Unsigned clocks continue across millis wrap.
  Detector wrap; arm(wrap, 0xFFFFFF00u);
  assert(sample(wrap, 0xFFFFFFC8u, 1900) == Event::None);
  assert(sample(wrap, 44u, 0) == Event::Tap);
}