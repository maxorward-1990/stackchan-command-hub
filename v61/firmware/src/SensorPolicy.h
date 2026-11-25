#pragma once
#include <cstdint>
#include <cmath>
// v39: pure, host-tested rules for the on-board battery (AXP2101), motion
// sensor (BMI270) and real-time clock (BM8563). No hardware access here.
namespace SensorPolicy {
// ---- Battery ----
inline constexpr int lowPercent = 20;
inline constexpr int criticalPercent = 10;
enum class Battery { Unknown, Charging, External, Ok, Low, Critical };
// level <0 means the PMIC could not be read. vbusMv >4000 means USB power present.
inline Battery battery(int level, bool charging, int vbusMv) {
  if (level < 0 || level > 100) return Battery::Unknown;
  if (charging) return Battery::Charging;
  if (vbusMv > 4000) return Battery::External;
  if (level <= criticalPercent) return Battery::Critical;
  if (level <= lowPercent) return Battery::Low;
  return Battery::Ok;
}
inline const char* batteryName(Battery b) {
  switch (b) {
    case Battery::Charging: return "charging"; case Battery::External: return "usb";
    case Battery::Ok: return "ok"; case Battery::Low: return "low"; case Battery::Critical: return "critical";
    default: return "unknown";
  }
}
// Warn once per downward crossing; re-arm only after recovering 5 points (no flapping).
struct LowBatteryWarner {
  bool warnedLow = false, warnedCritical = false;
  // Returns 0 none, 1 low, 2 critical.
  int update(Battery b, int level) {
    if (b == Battery::Charging || b == Battery::External || level > lowPercent + 5) { warnedLow = warnedCritical = false; return 0; }
    if (b == Battery::Critical && !warnedCritical) { warnedCritical = warnedLow = true; return 2; }
    if (b == Battery::Low && !warnedLow) { warnedLow = true; return 1; }
    return 0;
  }
};

// ---- Motion (accelerometer in g, gyro in deg/s) ----
inline constexpr uint32_t samplePeriodMs = 20;      // 50 Hz, short I2C reads
inline constexpr float tapSpikeG = 0.20f;           // more sensitive table knock; stillness/motor guards remain
inline constexpr float quietG = 0.08f;              // "still" before a knock
inline constexpr uint32_t quietBeforeTapMs = 300;
inline constexpr uint32_t tapRefractoryMs = 800;
inline constexpr float liftGyroDps = 60.0f;         // sustained rotation = carried
inline constexpr uint32_t liftHoldMs = 400;
inline constexpr float tipCos = 0.5f;               // >60 deg from upright
inline constexpr uint32_t tipHoldMs = 700;
inline constexpr uint32_t ignoreAfterMotorMs = 600; // own servos/speaker shake the body

enum class Motion { None, Tap, Lifted, Tipped, Upright };
inline const char* motionName(Motion m) {
  switch (m) { case Motion::Tap: return "tap"; case Motion::Lifted: return "lifted";
    case Motion::Tipped: return "tipped"; case Motion::Upright: return "upright"; default: return "none"; }
}

inline const char* recoveryEmotion(bool recording, bool speaking, bool conversation) {
  return speaking ? "speaking" : recording ? "listening" : conversation ? "thinking" : "neutral";
}

struct MotionDetector {
  uint32_t quietSince = 0, lastTap = 0, rotatingSince = 0, tiltSince = 0, lastSelfMotion = 0;
  float refX = 0, refY = 0, refZ = 1;   // gravity direction when standing; set from boot samples
  void setUpright(float x, float y, float z) {
    float n = std::sqrt(x * x + y * y + z * z);
    if (n > 0.5f) { refX = x / n; refY = y / n; refZ = z / n; }
  }
  bool tappedOnce = false, haveQuiet = false, rotating = false, tilted = false, lifted = false, tipped = false, primed = false;
  // selfMotion: our own servos are moving or speaker is playing.
  Motion update(uint32_t now, float ax, float ay, float az, float gx, float gy, float gz, bool selfMotion) {
    if (selfMotion) lastSelfMotion = now;
    float norm = std::sqrt(ax * ax + ay * ay + az * az);
    float dev = std::fabs(norm - 1.0f);
    float rot = std::sqrt(gx * gx + gy * gy + gz * gz);
    bool suppressed = selfMotion || (primed && now - lastSelfMotion < ignoreAfterMotorMs);
    primed = primed || selfMotion;
    // Orientation relative to the calibrated upright gravity vector.
    bool isTilted = norm > 0.5f && ((ax * refX + ay * refY + az * refZ) / norm) < tipCos;
    if (isTilted != tilted) { tilted = isTilted; tiltSince = now; }
    if (tilted && !tipped && now - tiltSince >= tipHoldMs) { tipped = true; return Motion::Tipped; }
    if (!tilted && tipped && now - tiltSince >= tipHoldMs) { tipped = false; lifted = false; return Motion::Upright; }
    if (suppressed) { haveQuiet = false; rotating = false; return Motion::None; }
    bool isRotating = rot > liftGyroDps;
    if (isRotating != rotating) { rotating = isRotating; rotatingSince = now; }
    if (rotating && !lifted && now - rotatingSince >= liftHoldMs) { lifted = true; haveQuiet = false; return Motion::Lifted; }
    if (dev < quietG && rot < liftGyroDps / 4) {
      if (!haveQuiet) { haveQuiet = true; quietSince = now; }
      if (lifted && !tilted && now - quietSince >= 1500) { lifted = false; return Motion::Upright; }
      return Motion::None;
    }
    bool wasQuiet = haveQuiet && now - quietSince >= quietBeforeTapMs;
    haveQuiet = false;
    if (!lifted && !tipped && wasQuiet && dev >= tapSpikeG && (!tappedOnce || now - lastTap >= tapRefractoryMs)) {
      tappedOnce = true; lastTap = now; return Motion::Tap;
    }
    return Motion::None;
  }
};

// ---- Real-time clock ----
inline constexpr int minValidYear = 2024;
inline bool clockValid(int year) { return year >= minValidYear && year < 2100; }
// Copy network time to the RTC when NTP is valid and the RTC is missing or >2 s off.
inline bool shouldWriteRtc(int ntpYear, long long ntpEpoch, int rtcYear, long long rtcEpoch) {
  if (!clockValid(ntpYear)) return false;
  if (!clockValid(rtcYear)) return true;
  long long d = ntpEpoch - rtcEpoch; if (d < 0) d = -d;
  return d > 2;
}
// At boot without network: seed system time from a valid RTC.
inline bool shouldSeedSystemFromRtc(int systemYear, int rtcYear) { return !clockValid(systemYear) && clockValid(rtcYear); }
}
