#include "../src/MenuPagerPolicy.h"
#include <cassert>
using namespace MenuPagerPolicy;
int main() {
  assert(classify(250, 120, 150, 125) == Gesture::Next);  // finger left 100 px
  assert(classify(100, 120, 200, 110) == Gesture::Prev);  // finger right
  assert(classify(200, 120, 141, 120) == Gesture::None);  // 59 px: neither swipe nor tap
  assert(classify(200, 120, 140, 120) == Gesture::Next);  // exactly 60 px
  assert(classify(160, 200, 180, 80) == Gesture::None);   // mostly vertical
  assert(classify(160, 120, 170, 130) == Gesture::Tap);
  assert(step(0, 2, Gesture::Next) == 1 && step(1, 2, Gesture::Next) == 0);
  assert(step(0, 2, Gesture::Prev) == 1 && step(1, 2, Gesture::Tap) == 1);
  assert(step(7, 2, Gesture::None) == 0 && step(0, 0, Gesture::Next) == 0);
  assert(titleHit(10, 10) == Title::Prev && titleHit(240, 10) == Title::Next);
  assert(titleHit(300, 10) == Title::Close && titleHit(150, 10) == Title::None);
  assert(titleHit(300, 40) == Title::None);
  // v71: swipe down closes from any page; wider close target.
  assert(classify(160, 60, 165, 160) == Gesture::Close && classify(160, 60, 160, 119) == Gesture::None);
  assert(step(2, 3, Gesture::Close) == 2);
  assert(titleHit(258, 10) == Title::Close && titleHit(200, 10) == Title::Next);
}
