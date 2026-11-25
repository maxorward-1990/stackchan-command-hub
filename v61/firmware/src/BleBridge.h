#pragma once
// Bluetooth LE command channel (Nordic UART Service layout) for Command Hub via
// Web Bluetooth. Carries the same "api #id METHOD /api/... json" lines as USB.
// Off by default; writes require pairing with the 6-digit PIN shown on the LCD.
#include <Arduino.h>

namespace BleBridge {
bool begin(const String& deviceName);  // starts advertising, picks a new PIN
void end();                            // stops and frees the BLE stack
bool enabled();
bool connected();
uint32_t pin();
bool takeLine(String& out);            // next complete command line from the phone
void sendLine(const String& line);     // notifies the line + '\n' in MTU-sized chunks
// Persisted "start Bluetooth at boot" flag (LittleFS/SD via caller's fs).
}
