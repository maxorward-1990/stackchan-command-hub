#pragma once
// v85 robot apps ("om … så …"): pure, host-tested rules shared by the on-robot store, player and triggers.
// The JSON format is Command Hub's format v1 (src/lib/robot-apps.ts) except that an image step carries
// {"file":"<id>_<step>.jpg"} (a JPEG stored next to the app) instead of inline base64.
#include <ArduinoJson.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cmath>

namespace RobotAppPolicy {
constexpr int kMaxApps = 16, kMaxTriggers = 4, kMaxSteps = 20, kMaxImages = 6;
constexpr size_t kMaxJsonBytes = 16384, kMaxImageBytes = 65536, kMaxTotalBytes = 1024 * 1024;
constexpr size_t kIdMax = 40, kNameMax = 120, kPhraseMax = 180, kTextMax = 600, kPromptMax = 1200, kTodoMax = 360, kTargetMax = 120;
constexpr size_t kOverlayTextMax = 120;
constexpr size_t kChunkBase64Max = 4096;  // one upload request; fits the 6144-byte USB api line

inline bool validId(const char* id) {
  if (!id) return false;
  size_t n = std::strlen(id);
  if (n < 1 || n > kIdMax) return false;
  for (size_t i = 0; i < n; ++i) {
    char c = id[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) return false;
  }
  return true;
}
inline void imageFile(const char* id, int step, char* out, size_t cap) { std::snprintf(out, cap, "%s_%d.jpg", id, step); }

enum class FileKind { Invalid, Json, Image };
/** "<id>.json" or "<id>_<step>.jpg" with a valid id; returns the id (without suffix) in idOut. */
inline FileKind parseFileName(const char* f, char* idOut, size_t cap) {
  if (!f || !idOut || cap < kIdMax + 1) return FileKind::Invalid;
  size_t n = std::strlen(f);
  if (n > 5 && !std::strcmp(f + n - 5, ".json")) {
    if (n - 5 > kIdMax) return FileKind::Invalid;
    std::memcpy(idOut, f, n - 5); idOut[n - 5] = 0;
    return validId(idOut) ? FileKind::Json : FileKind::Invalid;
  }
  if (n > 4 && !std::strcmp(f + n - 4, ".jpg")) {
    const char* us = nullptr;
    for (const char* p = f; p < f + n - 4; ++p) if (*p == '_') us = p;
    if (!us || us == f || us + 1 == f + n - 4 || static_cast<size_t>(us - f) > kIdMax) return FileKind::Invalid;
    for (const char* p = us + 1; p < f + n - 4; ++p) if (*p < '0' || *p > '9') return FileKind::Invalid;
    if (std::atoi(us + 1) >= kMaxSteps || (us + 2 < f + n - 4 && us[1] == '0')) return FileKind::Invalid;
    std::memcpy(idOut, f, us - f); idOut[us - f] = 0;
    return validId(idOut) ? FileKind::Image : FileKind::Invalid;
  }
  return FileKind::Invalid;
}

inline bool oneOf(const char* v, std::initializer_list<const char*> allowed) {
  if (!v) return false;
  for (const char* a : allowed) if (!std::strcmp(v, a)) return true;
  return false;
}
inline bool boundedText(JsonVariantConst v, size_t max) {
  if (!v.is<const char*>()) return false;
  const char* s = v.as<const char*>();
  size_t n = std::strlen(s);
  if (n < 1 || n > max) return false;
  for (size_t i = 0; i < n; ++i) if (s[i] != ' ' && s[i] != '\t' && s[i] != '\n') return true;
  return false;  // blank
}
inline bool numberIn(JsonVariantConst v, double lo, double hi) {
  if (!v.is<double>() && !v.is<long>()) return false;
  double d = v.as<double>();
  return std::isfinite(d) && d >= lo && d <= hi;
}
inline bool intIn(JsonVariantConst v, long lo, long hi) { return v.is<long>() && v.as<long>() >= lo && v.as<long>() <= hi; }
inline bool hexColor(JsonVariantConst v) {
  if (!v.is<const char*>()) return false;
  const char* s = v.as<const char*>();
  if (std::strlen(s) != 7 || s[0] != '#') return false;
  for (int i = 1; i < 7; ++i) { char c = s[i]; if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false; }
  return true;
}
inline bool timeOfDay(const char* s, int& hh, int& mm) {
  if (!s || std::strlen(s) != 5 || s[2] != ':') return false;
  for (int i : {0, 1, 3, 4}) if (s[i] < '0' || s[i] > '9') return false;
  hh = (s[0] - '0') * 10 + (s[1] - '0'); mm = (s[3] - '0') * 10 + (s[4] - '0');
  return hh < 24 && mm < 60;
}

inline const char* const kGestures[] = {"little_dance", "dance", "nod_yes", "shake_no", "curious_tilt", "look_left", "look_right", "look_up", "look_down", "look_at_user", "center_head"};
inline bool validGesture(const char* g) { if (!g) return false; for (const char* x : kGestures) if (!std::strcmp(x, g)) return true; return false; }

inline bool validTrigger(JsonVariantConst t) {
  const char* k = t["kind"] | "";
  if (oneOf(k, {"button", "head_touch", "lifted", "put_down", "tipped", "knock", "battery_low", "power_on", "power_off"})) return true;
  if (!std::strcmp(k, "time")) {
    int hh, mm;
    if (!timeOfDay(t["at"] | "", hh, mm)) return false;
    JsonArrayConst days = t["days"];
    if (days.isNull() || days.size() < 1 || days.size() > 7) return false;
    for (JsonVariantConst d : days) if (!intIn(d, 0, 6)) return false;
    return true;
  }
  if (!std::strcmp(k, "says")) return boundedText(t["phrase"], kPhraseMax);
  if (!std::strcmp(k, "near")) return intIn(t["threshold"], 1, 2047);
  if (!std::strcmp(k, "light")) return oneOf(t["when"] | "", {"dark", "bright"}) && intIn(t["threshold"], 0, 65535);
  return false;
}

/** Validates one step; index is the step position (image files are named after it). */
inline bool validStep(JsonVariantConst a, const char* appId, int index) {
  const char* k = a["kind"] | "";
  if (!a["with_previous"].isNull() && !a["with_previous"].is<bool>()) return false;
  if (oneOf(k, {"clear", "stop_talk", "reset", "listen"})) return true;
  if (!std::strcmp(k, "photo")) return a["show"].isNull() || a["show"].is<bool>();
  if (!std::strcmp(k, "describe")) return boundedText(a["prompt"], kPromptMax);
  if (!std::strcmp(k, "sound")) return oneOf(a["sound"] | "", {"beep", "double", "rising", "falling"});
  if (!std::strcmp(k, "overlay")) {  // v88: symbol and/or short text over the face
    const char* s = a["symbol"] | "";
    const bool text = !a["text"].isNull();
    if (!oneOf(s, {"heart", "star", "question", "exclaim", "zzz", "note", "none"}) || !numberIn(a["seconds"], 0.5, 60)) return false;
    if (text && !boundedText(a["text"], kOverlayTextMax)) return false;
    return std::strcmp(s, "none") || text;
  }
  if (!std::strcmp(k, "wait_for")) {  // v88: pause until something happens, at most `seconds`
    const char* e = a["event"] | "";
    if (!oneOf(e, {"head_touch", "knock", "lifted", "put_down", "tipped", "near", "light", "power_on", "power_off"})) return false;
    if (!intIn(a["seconds"], 1, 600) || !oneOf(a["otherwise"] | "", {"stop", "continue"})) return false;
    if (!std::strcmp(e, "near")) return intIn(a["threshold"], 1, 2047);
    if (!std::strcmp(e, "light")) return oneOf(a["when"] | "", {"dark", "bright"}) && intIn(a["threshold"], 0, 65535);
    return true;
  }
  if (!std::strcmp(k, "led")) return oneOf(a["mode"] | "", {"solid", "pulse", "rainbow", "off", "auto"}) && hexColor(a["color"]);
  if (!std::strcmp(k, "emotion")) return oneOf(a["emotion"] | "", {"neutral", "happy", "angry", "looking", "sleep"});
  if (!std::strcmp(k, "gesture")) return validGesture(a["gesture"] | "");
  if (!std::strcmp(k, "look")) return numberIn(a["pan"], -90, 90) && numberIn(a["tilt"], -30, 30);
  if (!std::strcmp(k, "text") || !std::strcmp(k, "speak")) return boundedText(a["text"], kTextMax);
  if (!std::strcmp(k, "todo")) return boundedText(a["text"], kTodoMax);
  if (!std::strcmp(k, "ask")) return boundedText(a["prompt"], kPromptMax);
  if (!std::strcmp(k, "lights")) return oneOf(a["action"] | "", {"scene", "on", "off"}) && boundedText(a["target"], kTargetMax);
  if (!std::strcmp(k, "timer")) return intIn(a["minutes"], 1, 90);
  if (!std::strcmp(k, "wait")) return numberIn(a["seconds"], 0.2, 60);
  if (!std::strcmp(k, "image")) {
    char expect[kIdMax + 16];
    imageFile(appId, index, expect, sizeof expect);
    const char* name = a["name"] | "";
    return std::strlen(name) <= 240 && !std::strcmp(a["file"] | "", expect);
  }
  return false;
}

// v87 step groups: a step with "with_previous" starts together with the step before it.
enum class Role : uint8_t { Other, Motion, Speech, Screen };
inline Role roleOf(const char* k) {
  if (oneOf(k, {"gesture", "look"})) return Role::Motion;
  if (oneOf(k, {"speak", "ask", "describe", "listen"})) return Role::Speech;
  if (oneOf(k, {"text", "image", "photo", "clear"})) return Role::Screen;
  return Role::Other;
}
inline bool withPrevious(JsonVariantConst a, int index) { return index > 0 && (a["with_previous"] | false); }
/** At most one motion, one speech/conversation and one screen step per group (one head, one voice, one screen). */
inline bool groupsValid(JsonArrayConst steps) {
  int motion = 0, speech = 0, screen = 0, i = 0;
  bool waitGroup = false;
  for (JsonVariantConst a : steps) {
    const bool waitFor = !std::strcmp(a["kind"] | "", "wait_for");
    if (!withPrevious(a, i)) { motion = speech = screen = 0; waitGroup = false; }
    else if (waitFor || waitGroup) return false;  // v88: "vänta på" stands alone
    waitGroup = waitGroup || waitFor;
    switch (roleOf(a["kind"] | "")) {
      case Role::Motion: if (++motion > 1) return false; break;
      case Role::Speech: if (++speech > 1) return false; break;
      case Role::Screen: if (++screen > 1) return false; break;
      default: break;
    }
    ++i;
  }
  return true;
}

/** nullptr when valid, else a short reason (also used in API errors). */
inline const char* validate(JsonVariantConst app) {
  if (!app.is<JsonObjectConst>()) return "not_an_object";
  const char* id = app["id"] | "";
  if (!validId(id)) return "invalid_id";
  if (!boundedText(app["name"], kNameMax)) return "invalid_name";
  if (!app["enabled"].is<bool>()) return "invalid_enabled";
  if (!intIn(app["cooldown_s"], 0, 3600)) return "invalid_cooldown";
  JsonArrayConst triggers = app["triggers"], steps = app["actions"];
  if (triggers.isNull() || triggers.size() < 1 || triggers.size() > kMaxTriggers) return "invalid_trigger_count";
  for (JsonVariantConst t : triggers) if (!validTrigger(t)) return "invalid_trigger";
  if (steps.isNull() || steps.size() < 1 || steps.size() > kMaxSteps) return "invalid_step_count";
  int i = 0, images = 0;
  for (JsonVariantConst a : steps) {
    if (!validStep(a, id, i)) return "invalid_step";
    if (!std::strcmp(a["kind"] | "", "image") && ++images > kMaxImages) return "too_many_images";
    ++i;
  }
  if (!groupsValid(steps)) return "group_conflict";
  return nullptr;
}

// ---- Compact metadata kept in RAM for menus, voice and triggers ----
enum class Trig : uint8_t { Button, Time, Says, Near, Light, HeadTouch, Lifted, PutDown, Tipped, Knock, BatteryLow, PowerOn, PowerOff };
inline const char* const kTrigNames[] = {"button", "time", "says", "near", "light", "head_touch", "lifted", "put_down", "tipped", "knock", "battery_low", "power_on", "power_off"};
struct TriggerMeta { Trig kind = Trig::Button; char phrase[kPhraseMax + 1] = {}; uint8_t hh = 0, mm = 0, days = 0; bool dark = true; uint32_t threshold = 0; };
struct AppMeta {
  char id[kIdMax + 1] = {}; char name[kNameMax + 1] = {};
  bool enabled = false; uint16_t cooldown = 0; uint8_t triggerCount = 0, steps = 0, images = 0;
  TriggerMeta t[kMaxTriggers];
};
/** Fills meta from a validated app. Returns false when the app is invalid. */
inline bool readMeta(JsonVariantConst app, AppMeta& m) {
  if (validate(app)) return false;
  m = AppMeta{};
  std::snprintf(m.id, sizeof m.id, "%s", app["id"].as<const char*>());
  std::snprintf(m.name, sizeof m.name, "%s", app["name"].as<const char*>());
  m.enabled = app["enabled"].as<bool>(); m.cooldown = app["cooldown_s"].as<uint16_t>();
  for (JsonVariantConst t : app["triggers"].as<JsonArrayConst>()) {
    TriggerMeta& x = m.t[m.triggerCount++];
    const char* k = t["kind"];
    if (!std::strcmp(k, "time")) { int hh, mm; timeOfDay(t["at"], hh, mm); x.kind = Trig::Time; x.hh = hh; x.mm = mm; for (JsonVariantConst d : t["days"].as<JsonArrayConst>()) x.days |= 1u << d.as<int>(); }
    else if (!std::strcmp(k, "says")) { x.kind = Trig::Says; std::snprintf(x.phrase, sizeof x.phrase, "%s", t["phrase"].as<const char*>()); }
    else if (!std::strcmp(k, "near")) { x.kind = Trig::Near; x.threshold = t["threshold"].as<uint32_t>(); }
    else if (!std::strcmp(k, "light")) { x.kind = Trig::Light; x.dark = !std::strcmp(t["when"], "dark"); x.threshold = t["threshold"].as<uint32_t>(); }
    else {
      x.kind = Trig::Button;
      for (int n = 0; n < static_cast<int>(sizeof kTrigNames / sizeof kTrigNames[0]); ++n) if (!std::strcmp(k, kTrigNames[n])) x.kind = static_cast<Trig>(n);
    }
  }
  for (JsonVariantConst a : app["actions"].as<JsonArrayConst>()) { m.steps++; if (!std::strcmp(a["kind"] | "", "image")) m.images++; }
  return true;
}

// ---- Speech matching (UTF-8; Swedish letters are folded to lower case) ----
/** Lower-cases ASCII and Å/Ä/Ö/É/Ü, turns other ASCII punctuation into single spaces; out is space-padded: " ord ord ". */
inline void normalizeWords(const char* in, char* out, size_t cap) {
  size_t o = 0;
  auto put = [&](char c) { if (o + 2 < cap) out[o++] = c; };
  put(' ');
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(in ? in : ""); *p; ++p) {
    unsigned char c = *p;
    if (c >= 'A' && c <= 'Z') put(char(c + 32));
    else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) put(char(c));
    else if (c == 0xC3 && p[1]) {
      unsigned char d = p[1]; ++p;
      if (d == 0x85 || d == 0x84 || d == 0x96 || d == 0x89 || d == 0x9C) d = static_cast<unsigned char>(d + 0x20);  // Å Ä Ö É Ü -> å ä ö é ü
      put(char(0xC3)); put(char(d));
    } else if (c >= 0x80) put(char(c));
    else if (o > 0 && out[o - 1] != ' ') put(' ');
  }
  if (o > 0 && out[o - 1] != ' ') put(' ');
  out[o] = 0;
}
/** Whole-word phrase match ("disco" in "Kör disco nu!", not in "discotek"). */
inline bool saysMatch(const char* phrase, const char* utterance) {
  char p[kPhraseMax * 2 + 4], u[1024];
  normalizeWords(phrase, p, sizeof p);
  normalizeWords(utterance, u, sizeof u);
  return std::strlen(p) > 2 && std::strstr(u, p) != nullptr;
}
/** Joins "[DU]" transcript fragments that arrive within gapMs into one utterance with a stable id. */
struct UtteranceJoiner {
  char text[600] = {}; uint32_t last = 0, id = 0; bool any = false; uint32_t gapMs = 2500;
  const char* push(const char* fragment, uint32_t now) {
    if (!any || now - last > gapMs) { text[0] = 0; ++id; }
    any = true; last = now;
    size_t n = std::strlen(text), m = std::strlen(fragment ? fragment : "");
    if (n + m >= sizeof text) { size_t drop = n + m - sizeof text + 1; if (drop > n) drop = n; std::memmove(text, text + drop, n - drop + 1); n -= drop; }
    std::strncat(text, fragment ? fragment : "", sizeof text - n - 1);
    return text;
  }
};

/** Level trigger to one-shot event: unknown readings never fire and reset the baseline. */
struct Edge {
  int8_t prev = -1;  // -1 unknown, 0 inactive, 1 active
  bool update(bool known, bool active) {
    if (!known) { prev = -1; return false; }
    bool fire = prev == 0 && active;
    prev = active ? 1 : 0;
    return fire;
  }
};
inline bool sensorActive(const TriggerMeta& t, uint32_t ps, uint32_t als) {
  if (t.kind == Trig::Near) return ps >= t.threshold;
  if (t.kind == Trig::Light) return t.dark ? als <= t.threshold : als >= t.threshold;
  return false;
}
inline bool timeMatches(const TriggerMeta& t, int hh, int mm, int wday) {
  return t.kind == Trig::Time && t.hh == hh && t.mm == mm && wday >= 0 && wday < 7 && (t.days & (1u << wday));
}
inline bool mayStart(uint16_t cooldownS, bool everRun, uint32_t lastRunMs, uint32_t now) {
  return !everRun || now - lastRunMs >= uint32_t(cooldownS) * 1000u;
}

/** Same rules as Command Hub's waitForSpeech: start within startMs, end after quietMs silence, never longer than maxMs. */
struct SpeechWait {
  uint32_t t0 = 0, quietSince = 0; bool started = false, quiet = false;
  uint32_t startMs = 20000, maxMs = 90000, quietMs = 1500;
  void begin(uint32_t now) { t0 = now; started = false; quiet = false; }
  enum Result { Waiting, Done, NeverStarted };
  Result update(uint32_t now, bool speaking) {
    if (speaking) { started = true; quiet = false; }
    else if (started) { if (!quiet) { quiet = true; quietSince = now; } if (now - quietSince >= quietMs) return Done; }
    else if (now - t0 >= startMs) return NeverStarted;
    if (now - t0 >= maxMs) return Done;
    return Waiting;
  }
};

/** Fuzzy app-name lookup for voice: exact normalized name, else the only app whose name contains the words. */
inline int findByName(const AppMeta* apps, int n, const char* spoken) {
  char s[kNameMax * 2 + 4], a[kNameMax * 2 + 4];
  normalizeWords(spoken, s, sizeof s);
  if (std::strlen(s) <= 2) return -1;
  int found = -1, hits = 0;
  for (int i = 0; i < n; ++i) {
    normalizeWords(apps[i].name, a, sizeof a);
    if (!std::strcmp(a, s)) return i;
    if (std::strstr(a, s) || std::strstr(s, a)) { found = i; ++hits; }
  }
  return hits == 1 ? found : -1;
}
}  // namespace RobotAppPolicy
