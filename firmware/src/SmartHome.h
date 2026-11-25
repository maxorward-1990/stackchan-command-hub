#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>
// Tuya (Smart Life) cloud control of the owner's lights and sockets.
// HTTPS runs in one bounded background worker; results are taken on the main task.
namespace SmartHome {
void configure(const String& clientId, const String& clientSecret);
void setEnabled(bool enabled);
bool enabled();
bool configured();
bool available();
bool busy();
bool startList(bool silent = false);
bool startControl(JsonVariantConst args);
bool takeResult(String& result);
void cancel();
String deviceNames(size_t maxBytes = 700);
String sceneNames(size_t maxBytes = 400);
String diagnostics();
// Local scenes (/home_scenes.json): in {action: list|save|delete, scene?, name?}; returns HTTP-like status.
void attachStorage(fs::FS& fs);
int handleScenes(JsonVariantConst in, JsonDocument& out);
}
