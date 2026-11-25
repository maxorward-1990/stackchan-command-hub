#pragma once
#include <cstdint>
// Installs the PSRAM-preferring mbedTLS allocator (see TlsAllocPolicy.h).
// Call once in setup() before any network/TLS use.
namespace TlsAllocator {
bool install();
bool installed();
// One redacted line: live TLS bytes per pool, fallbacks and failures.
void log(const char* phase);
}
