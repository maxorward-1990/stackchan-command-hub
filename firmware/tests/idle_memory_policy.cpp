#include "../src/IdleMemoryPolicy.h"
#include <cassert>
int main() {
  using namespace IdleMemoryPolicy;
  Guard g;
  assert(!g.poll(0, true, 34000, 12276)); // observed healthy session must not churn
  assert(!g.poll(100, true, 19000, 7000));
  assert(!g.poll(5099, true, 19000, 7000));
  assert(g.poll(5100, true, 19000, 7000));
  assert(g.pauseWake(7099)); assert(!g.pauseWake(7100));
  assert(!g.poll(10000, true, 19000, 7000));
  assert(!g.poll(305100, true, 19000, 7000));
  assert(g.poll(310100, true, 19000, 7000));
  Guard busy;
  assert(!busy.poll(0, true, 19000, 7000));
  assert(!busy.poll(6000, false, 19000, 7000)); // never interrupt a user/task
  assert(!busy.poll(7000, true, 19000, 7000));
  assert(!busy.poll(11999, true, 19000, 7000));
  assert(busy.poll(12000, true, 19000, 7000));
  Guard recovery;
  assert(!recovery.poll(0, true, 30000, 7000));
  assert(!recovery.poll(4000, true, 30000, 8192));
  assert(!recovery.poll(6000, true, 30000, 7000));
  assert(recovery.poll(11000, true, 30000, 7000));
  Guard wrap;
  assert(!wrap.poll(0xfffffff0u, true, 19000, 7000));
  assert(wrap.poll(4984, true, 19000, 7000));
}