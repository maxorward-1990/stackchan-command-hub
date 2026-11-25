#pragma once
// On-device touch menu: hold the face ~1 s to open. Wi-Fi scan + on-screen
// keyboard, Bluetooth on/off with pairing PIN, volume, info and restart —
// so the robot can be reconfigured without phone, computer or setup network.
#include <Arduino.h>
#include <functional>

namespace TouchMenu {
struct Hooks {
  std::function<String(bool post, const char* path, const String& body)> api;  // same routes as USB/HTTP
  std::function<uint8_t()> getVolume;
  std::function<void(uint8_t)> setVolume;
  std::function<void()> onOpen;    // stop conversation etc.
  std::function<void()> onClose;   // redraw the face
  std::function<bool()> bleAtBoot;
  std::function<void(bool)> setBleAtBoot;
  std::function<void(bool)> setBle;  // start/stop Bluetooth
  String robotName;
  String firmware;
};
void begin(const Hooks& hooks);
bool active();
void open();
// Feed raw touch each loop. Returns true when the menu consumed the touch
// (caller must then not treat it as a voice tap).
bool loop(bool pressed, int x, int y);
}
