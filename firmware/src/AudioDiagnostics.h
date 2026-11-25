#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
// A local, explicitly requested capture of the same processed 16kHz mono PCM
// that Live sends. Never sent to Gemini or written to storage.
namespace AudioDiagnostics {
bool start();
void loop();
void clear();
bool busy();
void status(JsonDocument& out);
bool chunk(uint32_t id, size_t offset, size_t count, JsonDocument& out);
void readyCue(uint8_t volume);
}