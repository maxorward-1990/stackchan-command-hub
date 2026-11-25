#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "SensorPolicy.h"
// v39: battery (AXP2101), motion (BMI270) and clock (BM8563), polled on the main loop.
namespace SensorMonitor {
void begin();  // seeds system time from the RTC when there is no network time yet
// selfMotion: servos moving or speaker playing. Returns a motion event (None most loops).
SensorPolicy::Motion loop(bool selfMotion);
void fillStatus(JsonObject out);
int batteryPercent();
const char* batteryState();
}
