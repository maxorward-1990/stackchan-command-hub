#include "../src/WakeWordPolicy.h"
#include <cassert>
using namespace WakeWordPolicy;
int main() {
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
