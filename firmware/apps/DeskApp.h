#pragma once
#include <ArduinoJson.h>
#include <M5GFX.h>
#include <cstddef>
#include <ctime>
namespace DeskApp {
// Persistence hooks (LittleFS on the robot, fakes on host). save returns success.
using SaveFn = bool (*)(const char* json);
using LoadFn = size_t (*)(char* buffer, size_t capacity);
void attachStore(SaveFn save, LoadFn load);  // loads the saved app; never auto-starts it
int handle(JsonVariantConst in, JsonDocument& out, bool busy);
void status(JsonDocument& out);
void update(bool busy);
void stopFullscreen();
void stop();  // any mode; used when another app takes the screen
bool fullscreen();
bool widgetVisible();
bool drawFullscreen(M5Canvas& canvas);
void drawWidget(M5Canvas& canvas);
// Offline start from the saved configuration using the robot's own clock (RTC/NTP).
// Returns nullptr on success, else a short Swedish reason for the LCD.
const char* startSaved(bool fullscreen, std::time_t now);
bool hasSaved();
const char* savedPlace();
}
