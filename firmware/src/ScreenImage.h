#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <M5GFX.h>
namespace ScreenImage {
bool showJpeg(const uint8_t* bytes, size_t size);
bool showInformation(JsonVariantConst content);
bool active();
bool hasPanel();
void drawPanel(M5Canvas& canvas);
void clear();
}
