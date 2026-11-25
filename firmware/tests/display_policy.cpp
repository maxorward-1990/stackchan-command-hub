#include "../src/DisplayPolicy.h"
#include <cassert>
#include <limits>
int main() {
  assert(DisplayPolicy::textFits(20, 100));
  assert(!DisplayPolicy::textFits(20, 0));
  assert(!DisplayPolicy::textFits(81, 100));
  assert(!DisplayPolicy::textFits(20, 2401));
  assert(DisplayPolicy::barValue(0));
  assert(DisplayPolicy::barValue(100));
  assert(!DisplayPolicy::barValue(-1));
  assert(!DisplayPolicy::barValue(101));
  assert(!DisplayPolicy::barValue(std::numeric_limits<double>::quiet_NaN()));
  assert(DisplayPolicy::panelHeight == 70);
  assert(DisplayPolicy::pageIndex(0, 7) == 0);
  assert(DisplayPolicy::pageIndex(4000, 7) == 1);
  assert(DisplayPolicy::pageIndex(8000, 7) == 2);
  assert(DisplayPolicy::pageIndex(12000, 7) == 0);
}