#pragma once
#include <ArduinoJson.h>
namespace InternetVisual {
bool handle(const String& name, JsonVariantConst args, JsonDocument& response);
bool start(const String& name, JsonVariantConst args);
bool takeResult(String& result);
void cancel();
bool busy();
}