#pragma once
#include <cstdint>
#include <string>
using String = std::string;
inline uint32_t testMillis = 0;
inline uint32_t millis() { return testMillis; }
struct TestSerial {
  template<class... Args> void printf(const char*, Args...) {}
};
inline TestSerial Serial;