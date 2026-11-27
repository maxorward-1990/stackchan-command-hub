#include "../src/PomodoroPolicy.h"
#include <cassert>
using namespace PomodoroPolicy;
int main() {
  assert(valid(25, 5, 4) && valid(1, 1, 1) && valid(90, 30, 8));
  assert(!valid(0, 5, 4) && !valid(91, 5, 4) && !valid(25, 0, 4) && !valid(25, 31, 4) && !valid(25, 5, 0) && !valid(25, 5, 9));
  Timer t; assert(!t.start(0, 5, 4, 0) && t.phase == Phase::Off);
  assert(t.start(25, 5, 2, 1000) && t.phase == Phase::Focus && t.round == 1 && t.remaining == 25u * 60000);
  assert(!t.tick(1000 + 60000) && t.remaining == 24u * 60000);
  // Pause freezes time.
  t.pause(1000 + 60000); assert(t.paused); assert(!t.tick(1000 + 10 * 60000) && t.remaining == 24u * 60000);
  t.resume(1000 + 10 * 60000); assert(!t.paused);
  // Remaining 24 min of focus -> break of 5 min.
  uint32_t now = 1000 + 10 * 60000 + 24 * 60000;
  assert(t.tick(now) && t.phase == Phase::Break && t.remaining == 5u * 60000);
  now += 5 * 60000; assert(t.tick(now) && t.phase == Phase::Focus && t.round == 2);
  // Last focus round ends in Done with no trailing break.
  now += 25 * 60000; assert(t.tick(now) && t.phase == Phase::Done && !t.active() && t.progressPermille() == 1000);
  t.pause(now); assert(!t.paused);
  // A long stall skips through phases instead of drifting.
  Timer u; u.start(1, 1, 3, 0); assert(u.tick(150000) && u.phase == Phase::Focus && u.round == 2 && u.remaining == 30000);
  // millis() wraparound.
  Timer w; w.start(1, 1, 1, 0xFFFFFFF0u); assert(!w.tick(0x10u) && w.remaining == 60000 - 0x20);
  assert(w.progressPermille() == 0);
  w.stop(); assert(w.phase == Phase::Off && w.progressPermille() == 0);
  // Touch stepper.
  assert(stepMinutes(25, 1) == 30 && stepMinutes(25, -1) == 20 && stepMinutes(90, 1) == 90 && stepMinutes(1, -1) == 1);
  assert(stepMinutes(7, 1) == 10 && stepMinutes(7, -1) == 5 && stepMinutes(2, -1) == 1);
  // Sub-minute timers (v71): seconds countdown, 10 s floor.
  assert(validSec(30, 1, 1) && validSec(10, 1, 1) && !validSec(9, 1, 1) && !validSec(5401, 1, 1));
  Timer s; assert(s.startSec(30, 1, 1, 0) && s.remaining == 30000);
  assert(!s.tick(15000) && s.progressPermille() == 500);
  assert(s.tick(30000) && s.phase == Phase::Done);
  assert(stepSeconds(60, -1) == 45 && stepSeconds(15, -1) == 15 && stepSeconds(45, 1) == 60 && stepSeconds(1500, 1) == 1800 && stepSeconds(5400, 1) == 5400);
  // Widget tap band.
  assert(widgetTap(170) && widgetTap(239) && !widgetTap(169) && !widgetTap(240));
}
