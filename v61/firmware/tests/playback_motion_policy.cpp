#include "../src/PlaybackMotionPolicy.h"
#include <cassert>
int main() {
  using namespace PlaybackMotionPolicy;
  // Listening stays closed throughout a dance, queued follow-up and speech.
  assert(!canListen(true, false, false, false));
  assert(!canListen(false, true, false, false));
  assert(!canListen(false, false, true, false));
  assert(!canListen(false, false, false, true));
  assert(canListen(false, false, false, false));
  assert(!motionFinished(true, 1000));
  assert(!motionFinished(false, 149));
  assert(motionFinished(false, 150));
  assert(motionTool("head_motion") && motionTool("servo_gesture"));
  assert(!motionTool("set_emotion"));
  assert(!std::strcmp(canonicalGesture("nod_once"), "nod_yes"));
  int duration = 0;
  for (auto step : dance) {
    assert(step.x >= -160 && step.x <= 160);
    assert(step.y >= 0 && step.y <= 90);
    duration += step.holdMs;
  }
  assert(duration == 2400);
  assert(dance[5].x == 0 && dance[5].y == 0);
  // Buffer small network bursts, but never strand a short completed answer.
  assert(!readyToPlay(2400, 799, false));
  assert(readyToPlay(19200, 0, false));
  assert(!readyToPlay(2400, 800, false));
  assert(!readyToPlay(9599, 1999, false));
  assert(readyToPlay(9600, 0, false));
  assert(readyToPlay(2400, 2000, false));
  assert(readyToPlay(2400, 0, true));
  assert(!readyToPlay(0, 1000, true));
  // Rebuffering after starvation is 120ms, without reducing the 800ms initial buffer.
  assert(!readyToPlay(2400, 119, false, true));
  assert(readyToPlay(2400, 120, false, true));
  assert(readyToPlay(2880, 0, false, true));
  assert(!readyToPlay(2880, 0, false));
  assert(!readyToPlay(0, 120, true, true));
  // Long queued speech is not a stall while playback is making progress.
  assert(!drainStalled(20000, 18000));
  assert(drainStalled(23000, 18000));
}