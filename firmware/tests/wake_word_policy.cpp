#include "../src/WakeWordPolicy.h"
#include <cassert>
using namespace WakeWordPolicy;
int main() {
  assert(kDefaultMinPeak == 1500 && kDefaultThresholdMilli == 650);
  assert(!acceptCandidate(446, 1500)); // recorded suspect candidate, not proof of silence
  assert(!acceptCandidate(1500, 1500) && acceptCandidate(1501, 1500));
  assert(validMinPeak(0) && validMinPeak(32767) && !validMinPeak(-1) && !validMinPeak(32768));
  assert(validThresholdMilli(400) && validThresholdMilli(950));
  assert(!validThresholdMilli(399) && !validThresholdMilli(951));
  Evidence evidence;
  assert(evidence.add(2000, 512) == 2000);
  for (int i = 0; i < 20; ++i) assert(acceptCandidate(evidence.add(446, 512), 1500));
  for (int i = 0; i < 12; ++i) evidence.add(446, 512);
  assert(!acceptCandidate(evidence.add(446, 512), 1500));
  evidence.add(3000, 512); evidence.reset();
  assert(evidence.add(446, 512) == 446);
  assert(!hasExternalMemory(0));
  assert(hasExternalMemory(8 * 1024 * 1024));
  Inputs idle; idle.enabled = true; idle.modelReady = true;
  assert(mayListen(idle));
  Inputs off = idle; off.enabled = false; assert(!mayListen(off));       // default off
  Inputs nomodel = idle; nomodel.modelReady = false; assert(!mayListen(nomodel));
  Inputs a = idle; a.recording = true; assert(!mayListen(a));
  a = idle; a.speaking = true; assert(!mayListen(a));
  a = idle; a.conversation = true; assert(!mayListen(a));
  a = idle; a.camera = true; assert(!mayListen(a));
  a = idle; a.menu = true; assert(!mayListen(a));
  a = idle; a.diagnostics = true; assert(!mayListen(a));
  a = idle; a.search = true; assert(!mayListen(a));
  a = idle; a.sinceConversationEndMs = 1499; assert(!mayListen(a));
  a.sinceConversationEndMs = 1500; assert(mayListen(a));
  a = idle; a.sinceFailureMs = 29999; assert(!mayListen(a));
  a.sinceFailureMs = 30000; assert(mayListen(a));
}
