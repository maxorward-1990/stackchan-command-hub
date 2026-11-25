#include "../src/TlsAllocPolicy.h"
#include <cassert>
#include <cstdint>
using namespace TlsAllocPolicy;
int main() {
  size_t out = 0;
  assert(!total(0, 16, out));
  assert(!total(16, 0, out));
  assert(!total(SIZE_MAX / 2 + 1, 2, out));       // overflow -> nullptr
  assert(total(1, 16717, out) && out == 16717);   // one TLS record buffer
  // TLS record buffers (~16.7 KiB) go to PSRAM first, internal only as fallback.
  Order big = orderFor(16717, true);
  assert(big.first == Pool::Psram && big.second == Pool::Internal);
  // Small mbedTLS objects stay internal first, PSRAM as fallback.
  Order small = orderFor(512, true);
  assert(small.first == Pool::Internal && small.second == Pool::Psram);
  Order edge = orderFor(513, true);
  assert(edge.first == Pool::Psram);
  // Without PSRAM: internal only, no fake second pool.
  Order nops = orderFor(16717, false);
  assert(nops.first == Pool::Internal && nops.second == Pool::None);
  Order zero = orderFor(0, true);
  assert(zero.first == Pool::None && zero.second == Pool::None);
}
