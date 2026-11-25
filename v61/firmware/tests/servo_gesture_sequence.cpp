#include "../src/ServoGestureController.h"
#include <M5StackChan.h>
#include <cassert>
int main() {
  ServoGestureController controller;
  controller.begin();
  assert(controller.queueGesture("little_dance"));
  assert(controller.active());
  const uint32_t times[] = {0, 400, 800, 1200, 1600, 1950};
  for (uint32_t t : times) { testMillis = t; controller.loop(); }
  assert(M5StackChan.Motion.moves.size() == 6);
  assert(M5StackChan.Motion.moves[0].x == -160);
  assert(M5StackChan.Motion.moves[1].x == 160);
  assert(M5StackChan.Motion.moves[5].x == 0);
  assert(M5StackChan.Motion.moves[5].y == 120);
  testMillis = 2399; controller.loop(); assert(controller.active());
  testMillis = 2400; controller.loop(); assert(!controller.active());
  assert(controller.anchorX() == 0 && controller.anchorY() == 120);
  assert(controller.queueGesture("nod_once"));
  assert(controller.currentGesture() == "nod_yes");
  for (int i = 0; i < 6; ++i) { controller.loop(); testMillis += 300; }
  assert(!controller.active());
  assert(controller.queueGesture("look_up"));
  controller.loop(); testMillis += 740; controller.loop();
  assert(!controller.active());
  assert(controller.anchorY() == 520);
  assert(!controller.queueGesture("imaginary_gesture"));
  // Explicit session stop must leave neither the ceiling pose nor queued dance.
  controller.returnToNeutral();
  controller.loop();
  assert(M5StackChan.Motion.moves.back().x == 0);
  assert(M5StackChan.Motion.moves.back().y == 120);
  testMillis += 700; controller.loop();
  assert(controller.anchorX() == 0 && controller.anchorY() == 120);
  assert(controller.queueGesture("little_dance"));
  controller.loop();
  controller.returnToNeutral(); controller.loop();
  assert(M5StackChan.Motion.moves.back().x == 0);
  assert(M5StackChan.Motion.moves.back().y == 120);
  testMillis += 700; controller.loop(); assert(!controller.active());
}