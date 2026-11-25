#include "../src/CameraStreamPolicy.h"
#include <cassert>
int main() {
  using namespace CameraStreamPolicy;
  assert(canStart(false, false));
  assert(!canStart(true, false));   // single viewer
  assert(!canStart(false, true));   // voice turn in progress
  assert(waitBeforeNextFrame(0) == 100);
  assert(waitBeforeNextFrame(40) == 60);
  assert(waitBeforeNextFrame(100) == 0);
  assert(waitBeforeNextFrame(5000) == 0);
  assert(!shouldStop(599999, 4, false));
  assert(shouldStop(600000, 0, false));  // 10 min privacy limit
  assert(shouldStop(0, 5, false));
  assert(shouldStop(0, 0, true));
  return 0;
}
