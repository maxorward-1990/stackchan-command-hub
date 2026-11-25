#pragma once
// v58: pure, host-testable mapping of model-invented gesture names to real ones.
// Gemini sometimes improvises names such as "calculation_motion"; failing those
// cost an extra model turn and an error face, so they map to a gentle motion.
#include <cstring>
#include <string>

namespace GestureAliasPolicy {
static const char* const kKnown[] = {
  "center_head", "center", "home", "look_at_user", "look_left_small", "look_right_small",
  "look_left", "look_right", "look_up", "look_down", "look_top_left", "look_top_right",
  "search_left_wide", "search_left", "search_center", "search_right", "search_right_wide",
  "nod_yes", "nod_once", "shake_no", "curious_tilt", "speaking_micro_motion",
  "little_dance", "dance", "stop_motion"};
constexpr const char* kFallback = "curious_tilt";

inline bool known(const std::string& n) {
  for (const char* k : kKnown) if (n == k) return true;
  return false;
}
inline bool has(const std::string& s, const char* w) { return s.find(w) != std::string::npos; }
// Returns a gesture name the controller accepts. Never empty.
inline const char* resolve(const std::string& raw) {
  std::string n;
  for (char c : raw.substr(0, 48)) n += (c >= 'A' && c <= 'Z') ? char(c + 32) : c;
  for (const char* k : kKnown) if (n == k) return k;
  if (has(n, "stop")) return "stop_motion";
  if (has(n, "danc")) return "little_dance";
  if (has(n, "nod") || has(n, "yes") || has(n, "agree")) return "nod_yes";
  if (has(n, "shake") || has(n, "disagree")) return "shake_no";
  if (has(n, "left")) return "look_left_small";
  if (has(n, "right")) return "look_right_small";
  if (has(n, "_up") || has(n, "up_") || n == "up") return "look_up";
  if (has(n, "down")) return "look_down";
  if (has(n, "center") || has(n, "user")) return "look_at_user";
  return kFallback;  // think/calculate/ponder/unknown
}
}  // namespace GestureAliasPolicy
