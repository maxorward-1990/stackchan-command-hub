#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>
#include "PersonalityPolicy.h"
// Owner-tunable personality, persisted in /personality.json and applied live (no reboot).
namespace Personality {
const PersonalityPolicy::Settings& get();
void begin(fs::FS& fs);
// Validates every field first; on success saves and applies. Returns "" or an error key.
String update(JsonVariantConst in);
void toJson(JsonObject out);
}
