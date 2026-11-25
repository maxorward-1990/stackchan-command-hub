#include "../src/SensorPolicy.h"
#include <cassert>
#include <string>
using namespace SensorPolicy;
static Motion feed(MotionDetector& d, uint32_t from, uint32_t to, float ax, float ay, float az, float g = 0, bool self = false) {
  Motion last = Motion::None;
  for (uint32_t t = from; t < to; t += samplePeriodMs) { Motion m = d.update(t, ax, ay, az, g, 0, 0, self); if (m != Motion::None) last = m; }
  return last;
}
int main() {
  // Battery: 20 % low, 10 % critical, charging/USB never warn.
  assert(battery(21, false, 0) == Battery::Ok);
  assert(battery(20, false, 0) == Battery::Low);
  assert(battery(10, false, 0) == Battery::Critical);
  assert(battery(5, true, 5000) == Battery::Charging);
  assert(battery(5, false, 5000) == Battery::External);
  assert(battery(-1, false, 0) == Battery::Unknown);
  LowBatteryWarner w;
  assert(w.update(Battery::Low, 19) == 1);
  assert(w.update(Battery::Low, 18) == 0);             // warn once
  assert(w.update(Battery::Critical, 9) == 2);
  assert(w.update(Battery::Critical, 8) == 0);
  assert(w.update(Battery::Low, 22) == 0 && w.warnedLow); // no re-arm at 22 %
  assert(w.update(Battery::Ok, 26) == 0 && !w.warnedLow); // re-arm after +5

  // Tap: still, then a spike -> one tap; second spike within 800 ms ignored.
  MotionDetector d;
  assert(feed(d, 0, 400, 0, 0, 1) == Motion::None);
  assert(d.update(400, 0, 0, 1.6f, 0, 0, 0, false) == Motion::Tap);
  feed(d, 420, 800, 0, 0, 1);
  assert(d.update(800, 0, 0, 1.6f, 0, 0, 0, false) == Motion::None);
  feed(d, 820, 1600, 0, 0, 1);
  assert(d.update(1600, 0, 0, 1.6f, 0, 0, 0, false) == Motion::Tap);

  // Table knock at 0.20 g is accepted, smaller vibration is not.
  MotionDetector table;
  feed(table, 0, 400, 0, 0, 1);
  assert(table.update(400, 0, 0, 1.21f, 0, 0, 0, false) == Motion::Tap);
  MotionDetector vibration;
  feed(vibration, 0, 400, 0, 0, 1);
  assert(vibration.update(400, 0, 0, 1.19f, 0, 0, 0, false) == Motion::None);

  // Own servo motion never counts as a tap, nor within 600 ms after.
  MotionDetector s;
  feed(s, 0, 400, 0, 0, 1);
  assert(s.update(400, 0, 0, 1.8f, 0, 0, 0, true) == Motion::None);
  feed(s, 420, 900, 0, 0, 1);
  assert(s.update(900, 0, 0, 1.8f, 0, 0, 0, false) == Motion::None);

  // Sustained rotation for 400 ms = lifted.
  MotionDetector l;
  feed(l, 0, 300, 0, 0, 1);
  assert(feed(l, 300, 760, 0, 0, 1, 120) == Motion::Lifted);
  assert(feed(l, 760, 2300, 0, 0, 1) == Motion::Upright);
  assert(feed(l, 2300, 4000, 0, 0, 1) == Motion::None);

  // Upright recovery must preserve the actual voice state, including active sessions.
  assert(std::string(recoveryEmotion(true, false, true)) == "listening");
  assert(std::string(recoveryEmotion(false, true, true)) == "speaking");
  assert(std::string(recoveryEmotion(false, false, true)) == "thinking");
  assert(std::string(recoveryEmotion(false, false, false)) == "neutral");

  // Lying on its side for 700 ms = tipped, back upright for 700 ms = upright.
  MotionDetector t;
  assert(feed(t, 0, 600, 1, 0, 0) == Motion::None);
  assert(feed(t, 600, 800, 1, 0, 0) == Motion::Tipped);
  assert(feed(t, 800, 1600, 0, 0, 1) == Motion::Upright);

  // Calibrated upright along y (robot stands with screen vertical): y-gravity is fine, z means tipped.
  MotionDetector c; c.setUpright(0, -1, 0);
  assert(feed(c, 0, 1000, 0, -1, 0) == Motion::None);
  assert(feed(c, 1000, 1800, 0, 0, 1) == Motion::Tipped);

  // Clock.
  assert(!clockValid(2000) && clockValid(2026));
  assert(shouldWriteRtc(2026, 1000, 2000, 0));
  assert(!shouldWriteRtc(2026, 1000, 2026, 999));
  assert(shouldWriteRtc(2026, 1000, 2026, 990));
  assert(!shouldWriteRtc(1970, 1000, 2000, 0));
  assert(shouldSeedSystemFromRtc(1970, 2026) && !shouldSeedSystemFromRtc(2026, 2026));
}
