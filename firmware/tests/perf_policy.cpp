#include <cstddef>
#include "../src/PerfPolicy.h"
#include <cassert>
int main() {
  assert(PerfPolicy::sampledBusy(75, 100) == 25);
  assert(PerfPolicy::sampledBusy(0, 100) == 100);
  assert(PerfPolicy::sampledBusy(100, 100) == 0);
  assert(PerfPolicy::sampledBusy(0, 0) == -1);
  assert(PerfPolicy::sampledBusy(101, 100) == -1);
  assert(PerfPolicy::speakingFrameMs == 90);
  assert(PerfPolicy::intervalMs == 1000);
  PerfPolicy::Metric m; m.add(30); m.add(10); m.add(50);
  assert(m.maximum == 50 && m.count == 3);
}