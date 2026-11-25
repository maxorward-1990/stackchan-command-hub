#include "../src/SearchHandoffPolicy.h"
#include <cassert>
#include <initializer_list>
using namespace SearchHandoffPolicy;
int main() {
  Gate g;
  assert(!g.queue(0, true, false));
  assert(!g.queue(601, true, false));
  assert(!g.queue(7, false, false));
  assert(!g.queue(7, true, true));
  for (int i = 0; i < 5; ++i) {
    assert(g.queue(600, true, false));
    assert(g.active() && !g.ready());
    g.searching();
    assert(!g.result(12289) && !g.result(0));
    assert(g.result(12288));
    assert(g.ready());
    assert(!g.queue(7, true, false)); // No repeated paid/credit-consuming search in resumed answer.
    assert(!g.ready()); // Send exactly once after setupComplete.
    g.cancel();
  }
  for (Stage s : {Stage::Queued, Stage::Searching, Stage::Reconnecting, Stage::Answering}) {
    g.stage = s; g.cancel();
    assert(!g.active() && !g.result(100) && !g.ready()); // Late results after Stop cannot restart Live.
  }
}