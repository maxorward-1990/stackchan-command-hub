#include "../src/TalkTouchPolicy.h"
#include <cassert>
using namespace TalkTouchPolicy;
int main() {
  assert(onTap(false, false, false) == Action::Start);          // tap 1: start listening
  assert(onTap(true, false, true) == Action::SendTurn);         // tap 2: stop listening, answer now
  assert(onTap(true, true, false) == Action::Interrupt);        // tap while it talks: interrupt
  assert(onTap(true, false, false) == Action::SendTurn);            // startup tap is retained
  assert(onTap(true, false, true, false) == Action::SendTurn); // quiet speech never becomes an end-conversation tap
  assert(onLongPress(true) == Action::EndConversation);         // hold: end conversation
  assert(onLongPress(false) == Action::OpenMenu);               // hold when idle: menu as before
  assert(onLongPress(false, 200) == Action::None);              // hold racing a timeout: no menu
  assert(onLongPress(false, 1500) == Action::OpenMenu);         // after the cooldown the menu works
  assert(holdThresholdMs(true) == 1000);                        // v59: ending a chat needs a 1 s hold
  assert(tapSilencePadMs(900) == 1200);
  assert(tapSilencePadMs(5000) == 2000);
  SilenceTail tail; tail.start(100, 900);
  assert(tail.due(100)); tail.sent(100);
  assert(!tail.due(224) && tail.due(225));
  for (uint32_t now = 225; now <= 1225; now += 125) { assert(tail.due(now)); tail.sent(now); }
  assert(!tail.due(1350) && !tail.done(1349) && tail.done(1350));
  tail.start(0xFFFFFFF0u, 900); tail.sent(0xFFFFFFF0u);
  assert(!tail.due(50) && tail.due(109)); // clock rollover
  tail.cancel(); assert(tail.remainingMs == 0 && !tail.due(1000));
  tail.start(2000, 900); assert(tail.remainingMs == 1200 && tail.due(2000));
  assert(holdThresholdMs(false) == 900);                        // menu keeps 0.9 s
  assert(!heardSpeech(249) && heardSpeech(250));
}
