#pragma once
// Runtime-toggleable Gemini tool groups. Pure and host-testable: the firmware
// stores one bool per group in runtime.json and only declares enabled tools to
// Gemini, so a disabled tool is invisible to the model (not just discouraged).
#include <cstdint>
#include <cstring>

namespace ToolToggle {
enum Group : uint8_t { Wikipedia = 1, Images = 2, Gestures = 4, Camera = 8, Memory = 16, Screen = 32, Emotions = 64 };

struct Key { const char* config; Group group; bool defaultOn; };
// Wikipedia defaults OFF: Gemini answers from its own knowledge unless the user turns lookup on.
inline constexpr Key keys[] = {
  {"tool_wikipedia", Wikipedia, false}, {"tool_images", Images, true},
  {"tool_gestures", Gestures, true},    {"tool_camera", Camera, true},
  {"tool_memory", Memory, true},        {"tool_screen", Screen, true},
  {"tool_emotions", Emotions, true},
};

inline uint8_t defaults() {
  uint8_t m = 0;
  for (const auto& k : keys) if (k.defaultOn) m |= k.group;
  return m;
}

// 0 = core tool that is never toggled (e.g. end_session).
inline uint8_t groupOf(const char* n) {
  if (!std::strcmp(n, "lookup_wikipedia")) return Wikipedia;
  if (!std::strcmp(n, "search_internet_images") || !std::strcmp(n, "show_internet_image")) return Images;
  if (!std::strcmp(n, "servo_gesture") || !std::strcmp(n, "head_motion")) return Gestures;
  if (!std::strcmp(n, "look_with_camera")) return Camera;
  if (!std::strcmp(n, "search_memory") || !std::strcmp(n, "remember_private_memory") ||
      !std::strcmp(n, "recall_private_memory") || !std::strcmp(n, "manage_todos")) return Memory;
  if (!std::strcmp(n, "show_information")) return Screen;
  if (!std::strcmp(n, "set_emotion")) return Emotions;
  return 0;
}

inline bool allowed(const char* n, uint8_t mask) {
  uint8_t g = groupOf(n);
  return g == 0 || (mask & g) != 0;
}

// Live mask: set at boot and on every runtime save, read when a Gemini session starts.
inline uint8_t& mask() { static uint8_t m = defaults(); return m; }
inline bool on(Group g) { return (mask() & g) != 0; }
}
