#include "Personality.h"
using namespace PersonalityPolicy;
namespace {
constexpr const char* kPath = "/personality.json";
Settings g;
fs::FS* gFs = nullptr;

String hex(uint32_t v) { char b[8]; snprintf(b, sizeof b, "#%06lX", static_cast<unsigned long>(v & 0xFFFFFF)); return b; }
String ledText(const Led& l) {
  switch (l.kind) {
    case LedKind::Off: return "off";
    case LedKind::Solid: return "solid:" + hex(l.rgb);
    case LedKind::Pulse: return "pulse:" + hex(l.rgb);
    default: return "default";
  }
}
// Apply JSON onto `s`; missing keys keep current values.
String apply(JsonVariantConst in, Settings& s) {
  auto secs = [&](const char* k, uint16_t& dst) -> bool {
    if (in[k].isNull()) return true;
    if (!in[k].is<long>() || !validSeconds(in[k].as<long>())) return false;
    dst = in[k].as<long>(); return true;
  };
  auto bright = [&](const char* k, uint8_t& dst) -> bool {
    if (in[k].isNull()) return true;
    if (!in[k].is<long>() || !validBrightness(in[k].as<long>())) return false;
    dst = in[k].as<long>(); return true;
  };
  auto flag = [&](const char* k, bool& dst) -> bool {
    if (in[k].isNull()) return true;
    if (!in[k].is<bool>()) return false;
    dst = in[k].as<bool>(); return true;
  };
  if (!secs("sleep_after_s", s.sleepAfterS) || !secs("screen_off_after_s", s.screenOffAfterS)) return "invalid_seconds";
  if (!bright("awake_brightness", s.awakeBrightness) || !bright("sleep_brightness", s.sleepBrightness)) return "invalid_brightness";
  if (!flag("sleep_face", s.sleepFace) || !flag("subtitles", s.subtitles) || !flag("listen_cue", s.listenCue) ||
      !flag("touch_menu", s.touchMenu) || !flag("nod_on_start", s.nodOnStart) ||
      !flag("status_text", s.statusText) || !flag("listening_waves", s.listeningWaves) ||
      !flag("eyebrows", s.eyebrows) || !flag("cheeks", s.cheeks) || !flag("wake_word", s.wakeWord)) return "invalid_flag";
  JsonVariantConst leds = in["led"], eyes = in["eye"];
  for (uint8_t i = 0; i < StateCount; ++i) {
    JsonVariantConst l = leds[kStateKeys[i]];
    if (!l.isNull() && (!l.is<const char*>() || !parseLed(l.as<const char*>(), s.led[i]))) return "invalid_led";
    JsonVariantConst e = eyes[kStateKeys[i]];
    if (!e.isNull() && (!e.is<const char*>() || !parseEye(e.as<const char*>(), s.eye[i]))) return "invalid_eye_color";
  }
  return "";
}
}  // namespace

namespace Personality {
const Settings& get() { return g; }

void begin(fs::FS& fs) {
  gFs = &fs;
  if (!fs.exists(kPath)) return;
  File f = fs.open(kPath, FILE_READ);
  if (!f) return;
  JsonDocument doc;
  if (deserializeJson(doc, f) == DeserializationError::Ok) {
    Settings s = g;
    String err = apply(doc.as<JsonVariantConst>(), s);
    if (!err.length()) g = s;
    Serial.printf("Personality: loaded %s\n", err.length() ? err.c_str() : "ok");
  }
  f.close();
}

void toJson(JsonObject o) {
  o["sleep_after_s"] = g.sleepAfterS;
  o["screen_off_after_s"] = g.screenOffAfterS;
  o["sleep_face"] = g.sleepFace;
  o["awake_brightness"] = g.awakeBrightness;
  o["sleep_brightness"] = g.sleepBrightness;
  o["subtitles"] = g.subtitles;
  o["listen_cue"] = g.listenCue;
  o["touch_menu"] = g.touchMenu;
  o["nod_on_start"] = g.nodOnStart;
  o["status_text"] = g.statusText;
  o["listening_waves"] = g.listeningWaves;
  o["eyebrows"] = g.eyebrows;
  o["cheeks"] = g.cheeks;
  o["wake_word"] = g.wakeWord;
  JsonObject led = o["led"].to<JsonObject>();
  JsonObject eye = o["eye"].to<JsonObject>();
  for (uint8_t i = 0; i < StateCount; ++i) {
    led[kStateKeys[i]] = ledText(g.led[i]);
    eye[kStateKeys[i]] = g.eye[i] == kNoColor ? String("default") : hex(g.eye[i]);
  }
}

String update(JsonVariantConst in) {
  Settings s = g;
  String err = apply(in, s);
  if (err.length()) return err;
  if (gFs) {
    JsonDocument doc;
    Settings old = g; g = s; toJson(doc.to<JsonObject>()); g = old;
    File f = gFs->open(kPath, FILE_WRITE);
    if (!f) return "save_failed";
    bool ok = serializeJson(doc, f) > 0;
    f.close();
    if (!ok) return "save_failed";
  }
  g = s;
  Serial.println("Personality: saved and applied");
  return "";
}
}  // namespace Personality
