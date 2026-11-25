#include "../src/WsTransportPolicy.h"
#include <cassert>
int main() {
  using namespace WsTransportPolicy;
  assert(taskCore == 0);
  assert(shouldDrain(0, 0, 64));
  assert(shouldDrain(3, 10, 64));
  assert(!shouldDrain(4, 0, 64));
  assert(!shouldDrain(0, 61, 64));
  assert(shouldDrain(0, 60, 64));
  assert(!forward(true) && forward(false));
  assert(inQueueLen >= maxEventsPerLoop && outQueueLen >= maxSendsPerPass);
}
