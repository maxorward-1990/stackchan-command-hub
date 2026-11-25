#include "../apps/DiagnosticModePolicy.h"
#include <cassert>
#include <cstdio>
using namespace DiagnosticModePolicy;

int main() {
  State s;
  assert(!active(s, 0));
  activate(s, 1000, 60);
  assert(active(s, 1000) && active(s, 60999) && !active(s, 61000));
  assert(remainingMs(s, 31000) == 30000 && remainingMs(s, 70000) == 0);
  // Bounded: never longer than 15 min, never zero.
  activate(s, 0, 100000); assert(remainingMs(s, 0) == kMaxSeconds * 1000u);
  activate(s, 0, 0); assert(remainingMs(s, 0) == 1000);
  activate(s, 0, -5); assert(active(s, 500) && !active(s, 1000));
  // Explicit stop ends it at once.
  activate(s, 0, 600); deactivate(s); assert(!active(s, 1));
  // millis() rollover.
  activate(s, 0xFFFFF000u, 10); assert(active(s, 0xFFFFFFF0u) && active(s, 0x00000100u) && !active(s, 0x00002000u));
  std::puts("diagnostic mode policy: ok");
  return 0;
}
