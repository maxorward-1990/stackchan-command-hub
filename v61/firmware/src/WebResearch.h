#pragma once
#include <Arduino.h>
namespace WebResearch {
// Called on the main loop before reserving/notifying a worker, never under its mutex.
void setPrepare(void (*prepare)());
void configure(const String& key);
void setEnabled(bool enabled);
bool enabled();
bool available();
bool busy();
bool start(const String& query);
bool takeResult(String& result);
void cancel();
String sourcesPage();
String diagnostics();
}