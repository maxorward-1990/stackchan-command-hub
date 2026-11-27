#pragma once
#include <ArduinoJson.h>
#include <M5GFX.h>
#include <cstddef>
namespace FocusApp {
using SaveFn = bool (*)(const char* json);
using LoadFn = size_t (*)(char* buffer, size_t capacity);
void attachStore(SaveFn save, LoadFn load);  // loads saved durations; never auto-starts
int handle(JsonVariantConst in, JsonDocument& out, bool busy);
void status(JsonDocument& out);
void update(bool busy);       // fullscreen yields to widget while busy; the timer keeps running
void leaveFullscreen();       // touch/wake: drop to widget, never stop the timer
void stop();
bool fullscreen();
bool widgetVisible();
bool running();
bool paused();
void togglePause();
const char* startSaved(bool fullscreen);  // nullptr on success
const char* summary();
void adjustFocus(int dir);   // touch -/+: step saved focus minutes and persist
int voice(JsonVariantConst args, JsonDocument& out);  // Gemini control_timer: plain countdown as widget, never persisted
bool simple();                    // "25/5 min · 4 pass"
bool drawFullscreen(M5Canvas& canvas);
void drawWidget(M5Canvas& canvas);
}
