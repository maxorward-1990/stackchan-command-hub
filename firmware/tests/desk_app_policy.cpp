#include "../apps/DeskAppPolicy.h"
#include <cassert>
int main() {
  using namespace DeskAppPolicy;
  State s;
  s.start(Mode::Widget, 100, weatherMaxMs);
  assert(s.widget()); s.update(200, true); assert(!s.widget() && s.suspended);
  s.update(300, false); assert(s.widget()); // Extension returns after speech.
  s.start(Mode::Fullscreen, 100, 1000); s.update(200, true);
  assert(s.mode == Mode::Off); s.update(300, false); assert(!s.fullscreen()); // No surprise restart.
  s.start(Mode::Fullscreen, 0xfffffff0u, 1000);
  assert(s.fresh(0x10u)); assert(s.remaining(0x10u) == 968);
  assert(!s.fresh(984)); assert(s.remaining(984) == 0);
  s.stop(); assert(!s.fullscreen() && !s.widget() && !s.fresh(100));
  s.start(Mode::Widget, 0, 0); assert(!s.fresh(1));
  s.update(sessionMaxMs, false); assert(s.mode == Mode::Off);
  assert(zoneSupported("Europe/Stockholm")); assert(!zoneSupported("invalid"));
  assert(!boundedText("", 48)); assert(!boundedText("a\nb", 48)); assert(boundedText("Stockholm", 48));
  assert(weatherMaxMs == 1800000);
}