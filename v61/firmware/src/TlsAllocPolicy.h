#pragma once
#include <cstddef>
#include <cstdint>
// v57: decides where mbedTLS (Gemini Live, Tavily, Tuya, Wikipedia) allocates.
// The prebuilt core forces TLS into internal RAM (CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC);
// two ~16.7 KiB record buffers per handshake then failed once WakeNet/search had
// fragmented internal RAM (-32512). Large TLS blocks go to PSRAM first; small ones
// stay internal for speed. Either pool falls back to the other; never more.
namespace TlsAllocPolicy {
enum class Pool : uint8_t { None, Internal, Psram };
struct Order { Pool first = Pool::None; Pool second = Pool::None; };
inline constexpr size_t kSmallInternalMax = 512;

// Overflow-safe n*size; false means the request must return nullptr.
inline bool total(size_t n, size_t size, size_t& out) {
  if (n == 0 || size == 0) return false;
  if (n > SIZE_MAX / size) return false;
  out = n * size;
  return true;
}

inline Order orderFor(size_t bytes, bool psramAvailable) {
  Order o;
  if (bytes == 0) return o;
  if (!psramAvailable) { o.first = Pool::Internal; return o; }
  if (bytes <= kSmallInternalMax) { o.first = Pool::Internal; o.second = Pool::Psram; }
  else { o.first = Pool::Psram; o.second = Pool::Internal; }
  return o;
}
}  // namespace TlsAllocPolicy
