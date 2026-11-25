#include "Proximity.h"
#include <M5Unified.h>
namespace {
constexpr uint8_t kAddr = 0x23;
bool configured = false;
uint32_t configuredMs = 0, lastAttempt = 0;
bool attempted = false;
bool readReg(uint8_t reg, uint8_t* data, size_t len) {
  return M5.In_I2C.readRegister(kAddr, reg, data, len, 100000L);
}
bool writeReg(uint8_t reg, uint8_t value) {
  return M5.In_I2C.writeRegister(kAddr, reg, &value, 1, 100000L);
}
bool configure() {
  if (configured) return true;
  uint32_t now = millis();
  if (attempted && uint32_t(now - lastAttempt) < 5000) return false;
  attempted = true; lastAttempt = now;
  // Datasheet-bounded bursts; no interrupts, allocation, waits or new task.
  configured = writeReg(0x81, 0x00) && writeReg(0x80, 0x00) &&
      writeReg(0x82, ProximityPolicy::kPsLed) && writeReg(0x83, ProximityPolicy::kPsPulses) && writeReg(0x84, ProximityPolicy::kPsRate) &&
      writeReg(0x85, ProximityPolicy::kAlsRate) && writeReg(0x80, ProximityPolicy::kAlsControl) && writeReg(0x81, ProximityPolicy::kPsControl);
  if (configured) configuredMs = now;
  return configured;
}
}
namespace Proximity {
Reading readDiagnostic() {
  Reading r;
  r.configOk = configure(); r.configured = configured; r.configuredMs = configuredMs;
  if (!r.configOk) { r.error = "i2c_config_failed"; return r; }
  uint8_t ps[2] = {}, als[4] = {};
  r.statusOk = readReg(0x8C, &r.status, 1);
  r.psOk = readReg(0x8D, ps, 2); r.alsOk = readReg(0x88, als, 4);
  r.raw = ((uint16_t(ps[1]) & 7u) << 8) | ps[0];
  r.ch1 = (uint16_t(als[1]) << 8) | als[0]; r.ch0 = (uint16_t(als[3]) << 8) | als[2];
  r.psSaturated = ps[1] & 0x80;
  r.alsValid = r.alsOk && r.statusOk && !(r.status & 0x80) &&
      ((r.status >> 4) & 7) == 6 && r.ch0 != 65535 && r.ch1 != 65535 &&
      uint32_t(millis() - configuredMs) >= ProximityPolicy::kAlsReadyMs;
  if (r.alsValid) r.luxEstimate = ProximityPolicy::estimatedLux(r.ch0, r.ch1, ProximityPolicy::kAlsGain, ProximityPolicy::kAlsIntegrationMs);
  if (!r.statusOk || !r.psOk || !r.alsOk) r.error = "i2c_read_failed_or_camera_bus_busy";
  else if (r.psSaturated) r.error = "ps_saturated";
  return r;
}
ProximityPolicy::Event loop(bool enabled, bool allowed, uint16_t threshold) {
  static ProximityPolicy::Detector detector;
  static uint32_t lastPoll = 0;
  static uint32_t readFailureMs = 0;
  static bool readFailed = false;
  static uint16_t lastThreshold = 0;
  if (!enabled || !allowed) { detector.reset(); return ProximityPolicy::Event::None; }
  if (lastThreshold != threshold) { detector.reset(); lastThreshold = threshold; }
  uint32_t now = millis();
  if (readFailed && uint32_t(now - readFailureMs) < 5000) return ProximityPolicy::Event::None;
  if (uint32_t(now - lastPoll) < ProximityPolicy::kPollMs) return ProximityPolicy::Event::None;
  lastPoll = now;
  if (!configure()) { detector.reset(); return ProximityPolicy::Event::None; }
  if (uint32_t(now - configuredMs) < ProximityPolicy::kPsReadyMs) { detector.reset(); return ProximityPolicy::Event::None; }
  uint8_t ps[2] = {};
  bool ok = readReg(0x8D, ps, 2);
  if (!ok) {
    detector.reset(); readFailed = true; readFailureMs = now;
    Serial.println("[PROX] sensor read failed; retry in 5 s");
    return ProximityPolicy::Event::None;
  }
  readFailed = false;
  uint16_t raw = ((uint16_t(ps[1]) & 7u) << 8) | ps[0];
  // Bit 7 in PS_DATA_1 is saturation, not proximity; invalid samples fail closed.
  return detector.poll(now, true, ok && !(ps[1] & 0x80), raw, threshold);
}
}