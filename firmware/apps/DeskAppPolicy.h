#pragma once
#include <cstdint>
#include <cstring>
#include "ClockPolicy.h"
namespace DeskAppPolicy {
constexpr uint32_t weatherMaxMs = 30 * 60 * 1000;
constexpr uint32_t sessionMaxMs = 7 * 24 * 60 * 60 * 1000;
enum class Mode { Off, Widget, Fullscreen };
inline bool zoneSupported(const char* zone) {
  std::tm utc{}; int offset = 0;
  return ClockPolicy::offset(zone, utc, offset);
}
inline bool boundedText(const char* text, size_t maxBytes) {
  if (!text || !*text || std::strlen(text) > maxBytes) return false;
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text); *p; ++p)
    if (*p < 32 || *p == 127) return false;
  return true;
}
struct State {
  Mode mode = Mode::Off;
  bool suspended = false;
  uint32_t started = 0;
  uint32_t weatherMs = 0;
  void start(Mode next, uint32_t now, uint32_t ttl) { mode = next; suspended = false; started = now; weatherMs = ttl; }
  void stop() { mode = Mode::Off; suspended = false; weatherMs = 0; }
  void update(uint32_t now, bool busy) {
    if (uint32_t(now - started) >= sessionMaxMs || (busy && mode == Mode::Fullscreen)) { stop(); return; }
    suspended = busy && mode == Mode::Widget;
  }
  bool widget() const { return mode == Mode::Widget && !suspended; }
  bool fullscreen() const { return mode == Mode::Fullscreen && !suspended; }
  bool fresh(uint32_t now) const { return mode != Mode::Off && weatherMs > 0 && uint32_t(now - started) < weatherMs; }
  uint32_t remaining(uint32_t now) const { return fresh(now) ? weatherMs - uint32_t(now - started) : 0; }
};
}