#pragma once
// Pure, tested rules for owner-tunable robot personality (v46). Stored in /personality.json,
// edited from Command Hub's Personality page and applied immediately, without reflashing.
#include <cstdint>
#include "WakeWordPolicy.h"
#include <cstring>
#include <cstddef>

namespace PersonalityPolicy {
enum class LedKind : uint8_t { Default, Off, Solid, Pulse };
struct Led { LedKind kind = LedKind::Default; uint32_t rgb = 0; };

// Face states the owner can restyle. Order is the storage/index order.
enum State : uint8_t { Neutral, Listening, Thinking, Speaking, Happy, Angry, Sleep, StateCount };
constexpr const char* kStateKeys[StateCount] = {"neutral", "listening", "thinking", "speaking", "happy", "angry", "sleep"};
constexpr uint32_t kNoColor = 0xFFFFFFFFu;  // keep firmware default

struct Settings {
  uint16_t sleepAfterS = 45;     // idle -> sleep face; 0 = never
  uint16_t screenOffAfterS = 30; // sleep face -> dark LCD; 0 = never
  bool sleepFace = true;         // false: dark LCD as soon as it sleeps
  uint8_t awakeBrightness = 127;
  uint8_t sleepBrightness = 40;  // dimmed sleep face
  bool subtitles = false;        // robot speech as text in the bottom panel
  bool listenCue = true;         // chirp when the mic opens
  bool touchMenu = true;         // hold when idle opens the menu; off = tap starts on touch-down
  bool nodOnStart = false;       // small nod when a conversation starts
  bool statusText = true;
  bool listeningWaves = true;
  bool eyebrows = true;
  bool cheeks = true;
  bool wakeWord = false;         // v50: local "Hi Stack Chan" wake word while idle
  uint16_t wakeThresholdMilli = WakeWordPolicy::kDefaultThresholdMilli;
  Led led[StateCount];
  uint32_t eye[StateCount] = {kNoColor, kNoColor, kNoColor, kNoColor, kNoColor, kNoColor, kNoColor};
};

constexpr uint16_t kMaxSeconds = 3600;
constexpr size_t kSubtitleChars = 110;

inline int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
// "#RRGGBB" only.
inline bool parseHex(const char* s, uint32_t& out) {
  if (!s || std::strlen(s) != 7 || s[0] != '#') return false;
  uint32_t v = 0;
  for (int i = 1; i < 7; ++i) { int d = hexDigit(s[i]); if (d < 0) return false; v = (v << 4) | uint32_t(d); }
  out = v; return true;
}
// "" or "default" -> firmware colour; otherwise "#RRGGBB".
inline bool parseEye(const char* s, uint32_t& out) {
  if (!s || !s[0] || std::strcmp(s, "default") == 0) { out = kNoColor; return true; }
  return parseHex(s, out);
}
// "default" | "off" | "solid:#RRGGBB" | "pulse:#RRGGBB"
inline bool parseLed(const char* s, Led& out) {
  if (!s) return false;
  if (!s[0] || std::strcmp(s, "default") == 0) { out = Led{}; return true; }
  if (std::strcmp(s, "off") == 0) { out = Led{LedKind::Off, 0}; return true; }
  uint32_t rgb;
  if (std::strncmp(s, "solid:", 6) == 0 && parseHex(s + 6, rgb)) { out = Led{LedKind::Solid, rgb}; return true; }
  if (std::strncmp(s, "pulse:", 6) == 0 && parseHex(s + 6, rgb)) { out = Led{LedKind::Pulse, rgb}; return true; }
  return false;
}
inline bool validSeconds(long v) { return v >= 0 && v <= kMaxSeconds; }
inline bool validBrightness(long v) { return v >= 0 && v <= 255; }
inline uint16_t rgb565(uint32_t rgb) {
  return uint16_t(((rgb >> 8) & 0xF800) | ((rgb >> 5) & 0x07E0) | ((rgb >> 3) & 0x001F));
}
// Idle tap starts the conversation on touch-down when the hold-menu is disabled,
// instead of waiting for release to tell a tap from a hold.
inline bool startOnPress(bool touchMenu, bool conversation) { return !touchMenu && !conversation; }
// Hold when idle opens the menu only when the owner kept the menu.
inline bool holdOpensMenu(bool touchMenu) { return touchMenu; }
inline bool sleepDue(uint16_t sleepAfterS, uint32_t idleMs) { return sleepAfterS && idleMs > uint32_t(sleepAfterS) * 1000u; }
inline bool screenOffDue(const Settings& s, uint32_t sleepingMs) {
  if (!s.sleepFace) return true;
  return s.screenOffAfterS && sleepingMs >= uint32_t(s.screenOffAfterS) * 1000u;
}
// Start index of the subtitle tail: last kSubtitleChars, cut at a word boundary.
inline size_t subtitleStart(const char* text, size_t len) {
  if (len <= kSubtitleChars) return 0;
  size_t i = len - kSubtitleChars;
  while (i < len && text[i] != ' ') ++i;
  return i < len ? i + 1 : len - kSubtitleChars;
}
}  // namespace PersonalityPolicy
