#include "../src/LiveSetupPolicy.h"
#include <cassert>
int main() {
  assert(LiveSetupPolicy::activeMemoryBytes == 2000);
  assert(LiveSetupPolicy::instructionBytes == 24576);
  assert(LiveSetupPolicy::validPacket(49152));
  assert(!LiveSetupPolicy::validPacket(49153));
  assert(!LiveSetupPolicy::validPacket(0));
}