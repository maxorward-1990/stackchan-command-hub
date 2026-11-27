#pragma once
// v85 robot apps stored on the robot (/rapps on the selected storage) and played without Command Hub.
// Rules and the player are pure and host-tested (RobotAppPolicy.h, RobotAppPlayer.h); this module only does
// storage, sensors and hardware calls on the main loop. One app runs at a time and yields its start to voice.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>

namespace RobotApps {
void begin(fs::FS& storage, bool sdMounted);  // v87: settings stay in LittleFS; a mounted SD card is extra space
/** Main loop. busy = conversation/menu/camera/diagnostics/internet worker active (blocks automatic starts). */
void loop(bool busy);
/** /api/robotapps: GET (empty in) = status; POST actions upload|install|delete|enable|run|stop|reset|import_sd. */
int handle(JsonVariantConst in, JsonDocument& out);
void status(JsonDocument& out);
int count();
String name(int index);
/** Starts (or queues until idle) the app; empty string on success, else a short Swedish reason. */
String startIndex(int index, const char* origin);
void stop();
void resetLook();
String statusLine();  // running app or last error, for the robot menu
String importSd();    // copies /stackchan-apps from an SD card into the robot; result message
bool running();
// Trigger inputs
void onUserWords(const char* fragment);  // "[DU]" transcript fragments during a conversation
bool onHeadTouch();                      // body touch press while idle; true = an app owns head touch (no conversation)
void onMotion(const char* motion);       // SensorPolicy motion name: tap, lifted, tipped, upright
int photos(JsonVariantConst in, JsonDocument& out);  // /api/photos: list (empty), get, delete, clear
// Gemini tool start_app
bool toolDeclared();
String toolDescription();
int toolCall(JsonVariantConst args, JsonDocument& out);
}
