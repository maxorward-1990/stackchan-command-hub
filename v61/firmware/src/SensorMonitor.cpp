#include "SensorMonitor.h"
#include <M5Unified.h>
#include <sys/time.h>
#include <time.h>
using namespace SensorPolicy;
namespace {
MotionDetector g_motion;
LowBatteryWarner g_warn;
uint32_t g_lastImu = 0, g_lastBattery = 0, g_lastRtcCheck = 0, g_taps = 0, g_lifts = 0, g_tips = 0;
int g_level = -1, g_vbus = 0; bool g_charging = false; Battery g_battery = Battery::Unknown;
const char* g_lastMotion = "none"; uint32_t g_lastMotionMs = 0;
float g_ax = 0, g_ay = 0, g_az = 0;
// Upright calibration: average the first second of still samples after boot.
float g_sumX = 0, g_sumY = 0, g_sumZ = 0; int g_calN = 0; bool g_calibrated = false;
bool g_rtcOk = false, g_rtcWritten = false, g_seeded = false;

long long rtcEpoch(int& year) {
  auto dt = M5.Rtc.getDateTime();
  year = dt.date.year;
  if (!clockValid(year)) return 0;
  struct tm t = {};
  t.tm_year = dt.date.year - 1900; t.tm_mon = dt.date.month - 1; t.tm_mday = dt.date.date;
  t.tm_hour = dt.time.hours; t.tm_min = dt.time.minutes; t.tm_sec = dt.time.seconds;
  return static_cast<long long>(mktime(&t));  // system TZ is UTC (configTime(0,0))
}
int systemYear() { time_t now = time(nullptr); struct tm t; gmtime_r(&now, &t); return t.tm_year + 1900; }

void readBattery() {
  g_level = M5.Power.getBatteryLevel();
  g_charging = M5.Power.isCharging() == m5::Power_Class::is_charging;
  g_vbus = M5.Power.getVBUSVoltage();
  g_battery = battery(g_level, g_charging, g_vbus);
  int w = g_warn.update(g_battery, g_level);
  if (w) Serial.printf("[SENSOR] batteri %s: %d %%\n", w == 2 ? "KRITISKT" : "lagt", g_level);
}
void syncRtc() {
  if (!M5.Rtc.isEnabled()) return;
  int ry = 0; long long re = rtcEpoch(ry);
  g_rtcOk = clockValid(ry);
  int sy = systemYear();
  if (shouldWriteRtc(sy, static_cast<long long>(time(nullptr)), ry, re)) {
    time_t now = time(nullptr); struct tm t; gmtime_r(&now, &t);
    { M5.Rtc.setDateTime(&t); g_rtcOk = true; g_rtcWritten = true; Serial.println("[SENSOR] klocka: RTC satt fran natet"); }
  }
}
}  // namespace

namespace SensorMonitor {
void begin() {
  if (M5.Rtc.isEnabled()) {
    int ry = 0; long long re = rtcEpoch(ry);
    g_rtcOk = clockValid(ry);
    if (shouldSeedSystemFromRtc(systemYear(), ry)) {
      struct timeval tv = { static_cast<time_t>(re), 0 };
      settimeofday(&tv, nullptr);
      g_seeded = true;
      Serial.printf("[SENSOR] klocka: systemtid fran RTC (%d)\n", ry);
    }
  }
  readBattery();
  Serial.printf("[SENSOR] imu=%s rtc=%s batteri=%d%% (%s)\n", M5.Imu.isEnabled() ? "ok" : "saknas",
                M5.Rtc.isEnabled() ? (g_rtcOk ? "ok" : "ej satt") : "saknas", g_level, batteryName(g_battery));
}

Motion loop(bool selfMotion) {
  uint32_t now = millis();
  if (now - g_lastBattery >= 5000) { g_lastBattery = now; readBattery(); }
  if (now - g_lastRtcCheck >= 60000 || g_lastRtcCheck == 0) { g_lastRtcCheck = now ? now : 1; syncRtc(); }
  if (!M5.Imu.isEnabled() || now - g_lastImu < samplePeriodMs) return Motion::None;
  g_lastImu = now;
  M5.Imu.update();
  float gx = 0, gy = 0, gz = 0;
  if (!M5.Imu.getAccel(&g_ax, &g_ay, &g_az)) return Motion::None;
  M5.Imu.getGyro(&gx, &gy, &gz);
  if (!g_calibrated) {
    float n = sqrtf(g_ax * g_ax + g_ay * g_ay + g_az * g_az);
    if (!selfMotion && fabsf(n - 1.0f) < quietG) { g_sumX += g_ax; g_sumY += g_ay; g_sumZ += g_az; ++g_calN; }
    if (g_calN >= 50) {
      g_motion.setUpright(g_sumX, g_sumY, g_sumZ); g_calibrated = true;
      Serial.printf("[SENSOR] upratt = %.2f %.2f %.2f\n", g_sumX / g_calN, g_sumY / g_calN, g_sumZ / g_calN);
    }
    return Motion::None;
  }
  Motion m = g_motion.update(now, g_ax, g_ay, g_az, gx, gy, gz, selfMotion);
  if (m != Motion::None) {
    g_lastMotion = motionName(m); g_lastMotionMs = now;
    if (m == Motion::Tap) ++g_taps; else if (m == Motion::Lifted) ++g_lifts; else if (m == Motion::Tipped) ++g_tips;
    Serial.printf("[SENSOR] rorelse: %s\n", g_lastMotion);
  }
  return m;
}

void fillStatus(JsonObject out) {
  auto p = out["power"].to<JsonObject>();
  p["battery_percent"] = g_level; p["state"] = batteryName(g_battery);
  p["charging"] = g_charging; p["vbus_mv"] = g_vbus;
  auto m = out["motion"].to<JsonObject>();
  m["available"] = M5.Imu.isEnabled(); m["calibrated"] = g_calibrated;
  m["last"] = g_lastMotion; m["last_age_ms"] = g_lastMotionMs ? millis() - g_lastMotionMs : 0;
  m["taps"] = g_taps; m["lifts"] = g_lifts; m["tips"] = g_tips;
  m["tipped"] = g_motion.tipped; m["lifted"] = g_motion.lifted;
  auto c = out["clock"].to<JsonObject>();
  c["rtc_available"] = M5.Rtc.isEnabled(); c["rtc_valid"] = g_rtcOk;
  c["rtc_set_from_network"] = g_rtcWritten; c["seeded_from_rtc"] = g_seeded;
  time_t now = time(nullptr);
  if (clockValid(systemYear())) { char buf[24]; struct tm t; gmtime_r(&now, &t); strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &t); c["utc"] = buf; }
}
int batteryPercent() { return g_level; }
const char* batteryState() { return batteryName(g_battery); }
}
