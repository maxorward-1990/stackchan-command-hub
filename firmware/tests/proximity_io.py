"""Exercise actual proximity I/O against a host fake; no physical sensor claims."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="proximity-io-") as directory:
    tmp = Path(directory)
    (tmp / "M5Unified.h").write_text(r'''
#pragma once
#include <cstdint>
#include <cstddef>
inline uint32_t clockMs = 0;
inline uint32_t millis() { return clockMs; }
struct FakeSerial { void println(const char*) {} };
inline FakeSerial Serial;
struct FakeM5 {
  struct FakeI2C {
    int reads = 0, writes = 0;
    bool failRead = false, failWrite = false, saturated = false;
    uint16_t raw = 0;
    uint16_t ch0 = 1000, ch1 = 200;
    uint8_t regs[256] = {};
    uint8_t status = 0x60;
    bool writeRegister(uint8_t addr, uint8_t reg, uint8_t* data, size_t len, long freq) {
      if (!failWrite) regs[reg] = data[0];
      ++writes; return addr == 0x23 && len == 1 && freq == 100000 && !failWrite;
    }
    bool readRegister(uint8_t addr, uint8_t reg, uint8_t* data, size_t len, long freq) {
      ++reads;
      if (failRead || addr != 0x23 || freq != 100000) return false;
      for (size_t i = 0; i < len; ++i) data[i] = 0;
      if (reg == 0x8D) { data[0] = raw & 255; data[1] = (raw >> 8) | (saturated ? 0x80 : 0); }
      if (reg == 0x8C) data[0] = status;
      if (reg == 0x88) { data[0] = ch1 & 255; data[1] = ch1 >> 8; data[2] = ch0 & 255; data[3] = ch0 >> 8; }
      return true;
    }
  } In_I2C;
};
inline FakeM5 M5;
''')
    (tmp / "test.cpp").write_text(r'''
#include "M5Unified.h"
#include "Proximity.h"
#include <cassert>
using Event = ProximityPolicy::Event;
bool shifted = false;
Event poll(uint32_t t, uint16_t raw = 0, bool enabled = true, bool allowed = true) {
  clockMs = shifted && t >= 2150 ? t + 150 : t; M5.In_I2C.raw = raw;
  return Proximity::loop(enabled, allowed, 1800);
}
int main(int argc, char**) {
  auto& bus = M5.In_I2C;
  if (argc > 1) {
    bus.failWrite = true;
    for (int t = 50; t < 5000; t += 50) assert(poll(t) == Event::None);
    assert(bus.writes == 1 && bus.reads == 0); // no repeated config storm
    bus.failWrite = false; poll(5050);
    assert(bus.writes == 9 && bus.reads == 0); // startup samples never reach the detector
    poll(5200); assert(bus.reads == 1);
    return 0;
  }
  shifted = true;
  for (int t = 0; t < 1000; t += 50) assert(poll(t, 1900, false) == Event::None);
  for (int t = 1000; t < 2000; t += 50) assert(poll(t, 1900, true, false) == Event::None);
  assert(bus.reads == 0 && bus.writes == 0); // off/conflicting use never touches I2C
  poll(2000); poll(2050); poll(2100);
  assert(bus.writes == 8 && bus.reads == 0); // nonblocking startup guard
  for (int t = 2000; t <= 2150; t += 50) { clockMs = t + 150; Proximity::loop(true, true, 1800); }
  assert(bus.writes == 8 && bus.reads == 4);
  assert(bus.regs[0x82] == 0x7F); // 60 kHz, 100% burst duty, 100 mA peak
  assert(bus.regs[0x83] == 8 && bus.regs[0x84] == 0); // 8 pulses / 50 ms
  assert(bus.regs[0x81] == 0x22); // saturation indication enabled, x16 (not max gain)
  assert(bus.regs[0x80] == 0x19 && bus.regs[0x85] == 0x12); // x48 / 200 ms
  poll(2200, 1900); poll(2250, 1900);
  assert(poll(2300) == Event::Tap);
  int reads = bus.reads; poll(2301); assert(bus.reads == reads); // 50 ms polling bound
  bus.failRead = true; assert(poll(2350) == Event::None);
  reads = bus.reads;
  for (int t = 2400; t < 7350; t += 50) assert(poll(t, 1900) == Event::None);
  assert(bus.reads == reads); // failed read backs off for 5 s
  bus.failRead = false;
  for (int t = 7350; t <= 7500; t += 50) poll(t);
  bus.saturated = true;
  for (int t = 7550; t <= 8750; t += 50) assert(poll(t, 1900) == Event::None);
  bus.saturated = false;
  for (int t = 8800; t <= 8950; t += 50) poll(t);
  assert(poll(9000, 1900) == Event::None);
  for (int t = 9050; t < 10000; t += 50) assert(poll(t, 1900) == Event::None);
  assert(poll(10000, 1900) == Event::Hold);
  assert(poll(10050, 1900) == Event::None);
  auto reading = Proximity::readDiagnostic();
  assert(reading.alsValid && reading.luxEstimate > 20 && reading.luxEstimate < 21);
  bus.saturated = true; reading = Proximity::readDiagnostic(); assert(reading.psSaturated);
  bus.status = 0xE0; assert(!Proximity::readDiagnostic().alsValid);
  bus.status = 0x60; bus.ch0 = 65535; assert(!Proximity::readDiagnostic().alsValid);
  bus.ch0 = 1000; bus.failRead = true; assert(!Proximity::readDiagnostic().alsValid);
}
''')
    exe = tmp / "test"
    subprocess.run(["g++", "-std=c++17", "-I", str(tmp), "-I", str(ROOT / "src"),
                    str(tmp / "test.cpp"), str(ROOT / "src/Proximity.cpp"), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
    subprocess.run([str(exe), "config-failure"], check=True)
print("Proximity actual I/O: disabled/conflict gating, poll bound, read/config backoff, saturation and one-shot hold passed")