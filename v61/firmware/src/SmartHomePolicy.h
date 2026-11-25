#pragma once
// Pure, host-testable rules for Tuya (Smart Life) light/socket control.
// Signing strings, device-name matching and command bodies live here; the
// firmware module only does HTTPS, HMAC and storage.
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace SmartHomePolicy {
inline constexpr char host[] = "openapi.tuyaeu.com";  // Central Europe data center
inline constexpr size_t maxDevices = 40, maxTargets = 20, maxTarget = 80;
inline constexpr char emptyBodySha256[] = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

struct Device { std::string id, name, category; bool online = true; };

// Tuya signature v2: METHOD \n sha256(body) \n (no signed headers) \n path?query
inline std::string stringToSign(const std::string& method, const std::string& bodySha256Hex, const std::string& pathAndQuery) {
  return method + "\n" + bodySha256Hex + "\n\n" + pathAndQuery;
}
// Token requests pass an empty access token.
inline std::string signPayload(const std::string& clientId, const std::string& accessToken, const std::string& t,
                               const std::string& nonce, const std::string& toSign) {
  return clientId + accessToken + t + nonce + toSign;
}

inline bool alnum(const std::string& s) {
  for (char c : s) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))) return false;
  return true;
}
inline bool validClientId(const std::string& s) { return s.size() >= 10 && s.size() <= 64 && alnum(s); }
inline bool validClientSecret(const std::string& s) { return s.size() >= 16 && s.size() <= 64 && alnum(s); }
inline bool validDeviceId(const std::string& s) { return !s.empty() && s.size() <= 40 && alnum(s); }

// Lowercase ASCII, fold å/ä→a and ö→o, everything else non-alphanumeric → single space.
inline std::string normalize(const std::string& in) {
  std::string out; bool space = true;
  for (size_t i = 0; i < in.size(); ++i) {
    unsigned char c = static_cast<unsigned char>(in[i]);
    char m = 0;
    if (c == 0xC3 && i + 1 < in.size()) {
      unsigned char d = static_cast<unsigned char>(in[++i]);
      if (d == 0xA5 || d == 0xA4 || d == 0x85 || d == 0x84) m = 'a';
      else if (d == 0xB6 || d == 0x96) m = 'o';
      else if (d == 0xA9 || d == 0x89) m = 'e';
    } else if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z')) m = static_cast<char>(c);
    else if (c >= 'A' && c <= 'Z') m = static_cast<char>(c - 'A' + 'a');
    if (m) { out += m; space = false; }
    else if (!space) { out += ' '; space = true; }
  }
  while (!out.empty() && out.back() == ' ') out.pop_back();
  return out;
}
inline std::vector<std::string> tokens(const std::string& s) {
  std::vector<std::string> out; std::string cur;
  for (char c : normalize(s)) { if (c == ' ') { if (!cur.empty()) out.push_back(cur); cur.clear(); } else cur += c; }
  if (!cur.empty()) out.push_back(cur);
  return out;
}
inline bool oneOf(const std::string& w, std::initializer_list<const char*> list) {
  for (const char* x : list) if (w == x) return true;
  return false;
}
inline bool allWord(const std::string& w) { return oneOf(w, {"all", "alla", "allt", "every", "everything", "samtliga"}); }
inline bool lightWord(const std::string& w) {
  return oneOf(w, {"light", "lights", "lamp", "lamps", "lampa", "lampan", "lampor", "lamporna", "ljus", "ljuset", "belysning", "belysningen"});
}
inline bool fillerWord(const std::string& w) { return oneOf(w, {"the", "in", "i", "pa", "och", "and", "my", "mina", "min"}); }

inline bool isLight(const std::string& category) {
  return oneOf(category, {"dj", "dd", "xdd", "fwd", "dc", "tgq", "fsd", "sxd", "mbd", "tyndj", "gyd"});
}
inline const char* switchCode(const std::string& category, bool alternate = false) {
  bool light = isLight(category);
  if (alternate) light = !light;
  return light ? "switch_led" : "switch_1";
}

// Returns indexes into devices. Exact full-name match wins; "all" = every device;
// only light words ("lamporna") = every light; otherwise every remaining word must
// prefix-match a word in the device name.
inline std::vector<size_t> selectTargets(const std::vector<Device>& devices, const std::string& target) {
  std::vector<size_t> out;
  std::string wanted = normalize(target);
  if (wanted.empty() || target.size() > maxTarget) return out;
  for (size_t i = 0; i < devices.size(); ++i)
    if (normalize(devices[i].name) == wanted) { out.push_back(i); return out; }
  bool all = false, lights = false; std::vector<std::string> words;
  for (const auto& w : tokens(target)) {
    if (allWord(w)) all = true; else if (lightWord(w)) lights = true; else if (!fillerWord(w)) words.push_back(w);
  }
  for (size_t i = 0; i < devices.size() && out.size() < maxTargets; ++i) {
    if (words.empty()) {
      if (all && !lights) out.push_back(i);
      else if (lights && isLight(devices[i].category)) out.push_back(i);
      continue;
    }
    auto name = tokens(devices[i].name); bool ok = true;
    for (const auto& w : words) {
      bool hit = false;
      for (const auto& n : name) if (n.compare(0, w.size(), w) == 0) { hit = true; break; }
      if (!hit) { ok = false; break; }
    }
    if (ok) out.push_back(i);
  }
  return out;
}

// Strict match first; then split on commas/"och"/"and"/"+" and union the parts.
// If nothing still matches, try each remaining word alone, but only when every
// word matches something (so "led-lamporna switch" = LEDs + switches, while an
// unknown word still yields nothing).
inline std::vector<size_t> selectTargetsMulti(const std::vector<Device>& devices, const std::string& target) {
  auto out = selectTargets(devices, target);
  if (!out.empty() || target.size() > maxTarget) return out;
  auto addAll = [&](const std::vector<size_t>& v) {
    for (size_t i : v) { bool dup = false; for (size_t j : out) if (j == i) dup = true; if (!dup && out.size() < maxTargets) out.push_back(i); }
  };
  std::vector<std::string> parts; std::string cur;
  for (const auto& w : tokens(target)) {
    if (oneOf(w, {"och", "and", "samt", "plus"})) { if (!cur.empty()) parts.push_back(cur); cur.clear(); }
    else cur += (cur.empty() ? "" : " ") + w;
  }
  if (!cur.empty()) parts.push_back(cur);
  std::vector<std::string> split;
  for (const auto& p : parts) split.push_back(p);
  // commas / '+' are already folded to spaces by normalize, so also split raw text
  if (target.find(',') != std::string::npos || target.find('+') != std::string::npos) {
    split.clear(); std::string piece;
    for (char c : target) { if (c == ',' || c == '+') { split.push_back(piece); piece.clear(); } else piece += c; }
    split.push_back(piece);
  }
  if (split.size() > 1) { for (const auto& p : split) addAll(selectTargets(devices, p)); if (!out.empty()) return out; }
  std::vector<std::vector<size_t>> each;
  for (const auto& w : tokens(target)) {
    if (allWord(w) || lightWord(w) || fillerWord(w)) continue;
    std::string stem = w;  // "lamporna"-style Swedish plural endings on device words
    for (const char* suf : {"lamporna", "lampor", "lampan", "erna", "arna", "orna", "na"}) {
      size_t n = std::strlen(suf);
      if (stem.size() > n + 1 && stem.compare(stem.size() - n, n, suf) == 0) { stem = stem.substr(0, stem.size() - n); break; }
    }
    auto hit = selectTargets(devices, stem);
    if (hit.empty()) return {};
    each.push_back(hit);
  }
  if (each.size() < 2) return {};
  for (const auto& v : each) addAll(v);
  return out;
}

// Local scenes (v45): owner-defined groups of device steps, stored on the robot.
// Tuya's cloud scene API is a paid service, so scenes run as plain device commands.
struct SceneStep { std::string device, action, color; int brightness = 0; };
struct Scene { std::string name; std::vector<SceneStep> steps; };
inline constexpr size_t maxScenes = 20, maxSceneSteps = 16, maxSceneName = 40, maxDeviceName = 64;
// Exact normalized name, else the first scene whose words all prefix-match.
inline int selectScene(const std::vector<Scene>& scenes, const std::string& name) {
  std::string wanted = normalize(name);
  if (wanted.empty() || name.size() > maxTarget) return -1;
  for (size_t i = 0; i < scenes.size(); ++i) if (normalize(scenes[i].name) == wanted) return static_cast<int>(i);
  auto words = tokens(name);
  for (size_t i = 0; i < scenes.size(); ++i) {
    auto n = tokens(scenes[i].name); bool ok = true, any = false;
    for (const auto& w : words) {
      if (oneOf(w, {"scene", "scenen", "scen", "the", "my", "min", "kor", "run", "aktivera", "activate"})) continue;
      any = true;
      bool hit = false; for (const auto& x : n) if (x.compare(0, w.size(), w) == 0) hit = true;
      if (!hit) { ok = false; break; }
    }
    if (ok && any) return static_cast<int>(i);
  }
  return -1;
}
inline int hueFor(const std::string& color);
// "" when the scene may be stored, else a stable error name.
inline std::string sceneError(const Scene& s) {
  if (normalize(s.name).empty()) return "scene_name_missing";
  if (s.name.size() > maxSceneName) return "scene_name_too_long";
  if (s.steps.empty()) return "scene_has_no_devices";
  if (s.steps.size() > maxSceneSteps) return "scene_too_many_devices";
  for (const auto& st : s.steps) {
    if (normalize(st.device).empty() || st.device.size() > maxDeviceName) return "scene_device_invalid";
    if (st.action == "on" || st.action == "off" || st.action == "white") continue;
    if (st.action == "brightness") { if (st.brightness < 1 || st.brightness > 100) return "scene_brightness_invalid"; continue; }
    if (st.action == "color") {
      if (hueFor(st.color) < 0) return "scene_color_invalid";
      if (st.brightness != 0 && (st.brightness < 1 || st.brightness > 100)) return "scene_brightness_invalid";
      continue;
    }
    return "scene_action_invalid";
  }
  return "";
}
// Insert or replace (same normalized name) within the bounded list.
inline std::string upsertScene(std::vector<Scene>& list, const Scene& s) {
  std::string e = sceneError(s);
  if (!e.empty()) return e;
  for (auto& x : list) if (normalize(x.name) == normalize(s.name)) { x = s; return ""; }
  if (list.size() >= maxScenes) return "too_many_scenes";
  list.push_back(s); return "";
}
inline bool removeScene(std::vector<Scene>& list, const std::string& name) {
  for (size_t i = 0; i < list.size(); ++i)
    if (normalize(list[i].name) == normalize(name)) { list.erase(list.begin() + static_cast<long>(i)); return true; }
  return false;
}
// Device for a scene step: exact normalized name only (scenes name devices explicitly).
inline int deviceIndex(const std::vector<Device>& d, const std::string& name) {
  std::string w = normalize(name);
  for (size_t i = 0; i < d.size(); ++i) if (normalize(d[i].name) == w) return static_cast<int>(i);
  return -1;
}
// Tuya rejects requests whose timestamp drifts; resync NTP and retry once.
inline bool retryAfterClockSync(long code) { return code == 1013; }

inline int hueFor(const std::string& color) {
  std::string c = normalize(color);
  if (oneOf(c, {"red", "rod"})) return 0;
  if (oneOf(c, {"orange"})) return 30;
  if (oneOf(c, {"yellow", "gul"})) return 60;
  if (oneOf(c, {"green", "gron"})) return 120;
  if (oneOf(c, {"cyan", "turkos", "turquoise"})) return 180;
  if (oneOf(c, {"blue", "bla"})) return 240;
  if (oneOf(c, {"purple", "lila", "violet"})) return 280;
  if (oneOf(c, {"pink", "rosa"})) return 320;
  return -1;
}
// 1–100 % → Tuya bright_value_v2 10–1000.
inline int brightnessValue(int percent) {
  if (percent < 1) percent = 1;
  if (percent > 100) percent = 100;
  return 10 + (percent - 1) * 990 / 99;
}

// Builds {"commands":[...]} or "" when the action does not fit the device.
// action: on | off | brightness | color | white.
inline std::string commandBody(const std::string& action, const std::string& category, int brightness,
                               const std::string& color, bool alternate = false) {
  std::string sw = switchCode(category, alternate);
  if (action == "on" || action == "off")
    return "{\"commands\":[{\"code\":\"" + sw + "\",\"value\":" + (action == "on" ? "true" : "false") + "}]}";
  if (!isLight(category)) return "";
  if (action == "brightness") {
    if (brightness < 1 || brightness > 100) return "";
    return "{\"commands\":[{\"code\":\"switch_led\",\"value\":true},{\"code\":\"bright_value_v2\",\"value\":" +
           std::to_string(brightnessValue(brightness)) + "}]}";
  }
  if (action == "white")
    return "{\"commands\":[{\"code\":\"switch_led\",\"value\":true},{\"code\":\"work_mode\",\"value\":\"white\"}]}";
  if (action == "color") {
    int h = hueFor(color);
    if (h < 0) return "";
    int v = brightness >= 1 && brightness <= 100 ? brightnessValue(brightness) : 1000;
    return "{\"commands\":[{\"code\":\"switch_led\",\"value\":true},{\"code\":\"work_mode\",\"value\":\"colour\"},"
           "{\"code\":\"colour_data_v2\",\"value\":{\"h\":" + std::to_string(h) + ",\"s\":1000,\"v\":" + std::to_string(v) + "}}]}";
  }
  return "";
}
inline bool validAction(const std::string& a) { return oneOf(a, {"on", "off", "brightness", "color", "white", "list", "scene"}); }

// Stable error names for Tuya response codes (shown in Command Hub and to Gemini).
inline const char* errorForCode(long code) {
  switch (code) {
    case 0: return "";
    case 1004: return "tuya_sign_invalid_check_secret";
    case 1010: case 1011: case 1012: return "tuya_token_invalid";
    case 1013: return "tuya_clock_wrong";
    case 1100: case 1109: return "tuya_bad_parameter";
    case 1106: return "tuya_permission_denied";
    case 2008: return "tuya_command_not_supported";
    case 2009: return "tuya_device_offline";
    case 28841101: case 28841002: return "tuya_api_not_subscribed";
    default: return "tuya_error";
  }
}
inline bool retryWithAlternateSwitch(long code) { return code == 2008 || code == 1109 || code == 1100; }
}
