#include "../src/TouchMenuPolicy.h"
#include <cassert>
using namespace TouchMenuPolicy;
int main() {
  assert(classify(200, true) == Press::Tap);
  assert(classify(200, false) == Press::None);
  assert(classify(900, false) == Press::Long);
  assert(isSwipeUp(160, 200, 160, 100));         // clear upward swipe
  assert(isSwipeUp(160, 200, 170, 140));         // exactly 60 px
  assert(!isSwipeUp(160, 200, 160, 141));        // 59 px: too short
  assert(!isSwipeUp(160, 100, 160, 200));        // downward
  assert(!isSwipeUp(40, 200, 260, 100));         // mostly sideways
  assert(!isSwipeUp(160, 120, 160, 120));        // tap/hold without movement
  assert(gridHit(10, 10, 2, 3) == -1);          // title bar
  assert(gridHit(20, 50, 2, 3) == 0);
  assert(gridHit(300, 230, 2, 3) == 5);
  Layer l = Layer::Lower; std::string t;
  assert(keyAt(5, 64 + 34 + 2, l).ch == 'q');
  assert(keyAt(5, 10, l).action == Action::None);
  apply(t, l, {Action::Shift, 0}); assert(l == Layer::Upper);
  apply(t, l, keyAt(5, 64 + 34 + 2, l)); assert(t == "Q" && l == Layer::Lower);
  assert(!apply(t, l, keyAt(250, 64 + 4 * 34 + 2, l)));  // OK rejected: <8 chars
  t = "hemligt1"; assert(apply(t, l, keyAt(250, 64 + 4 * 34 + 2, l)));
  apply(t, l, keyAt(200, 64 + 4 * 34 + 2, l)); assert(t == "hemligt");
  std::string e; assert(apply(e, l, {Action::Ok, 0}));   // open network
  std::string big(70, 'a'); Layer l2 = Layer::Lower; std::string x = big.substr(0, 63); apply(x, l2, {Action::Char, 'b'}); assert(x.size() == 63);
  assert(jsonEscape("a\"b\\c") == "a\\\"b\\\\c");
  return 0;
}
