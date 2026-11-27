#include "DeskApp.h"
#include "DeskAppPolicy.h"
#include <Arduino.h>
#include <cstdio>
#include <ctime>
namespace DeskApp {
static DeskAppPolicy::State state;
static char id[81]{}, place[49]{}, zone[32]{}, weather[65]{};
static std::time_t epoch = 0;
static bool seconds = false;
static uint32_t lastDraw = 0;
// Saved configuration (LittleFS /apps.json): survives reboot, used offline from the menu.
struct Saved { bool has = false, seconds = false, full = false; char id[81]{}, place[49]{}, zone[32]{}, weather[65]{}; uint32_t weatherEpoch = 0, ttl = 0; };
static Saved saved;
static bool persisted = false;
static SaveFn saveFn = nullptr;
static LoadFn loadFn = nullptr;
static bool validSaved(JsonVariantConst d) {
  return d["version"].is<int>() && d["version"].as<int>() == 1 && d["seconds"].is<bool>() &&
      DeskAppPolicy::boundedText(d["id"] | "", 80) && DeskAppPolicy::boundedText(d["place"] | "", 48) &&
      DeskAppPolicy::zoneSupported(d["timezone"] | "") &&
      (!std::strcmp(d["mode"] | "", "widget") || !std::strcmp(d["mode"] | "", "fullscreen")) &&
      d["weather_ttl_ms"].is<uint32_t>() && d["weather_ttl_ms"].as<uint32_t>() <= DeskAppPolicy::weatherMaxMs &&
      d["weather_epoch"].is<uint32_t>() &&
      (!d["weather_ttl_ms"].as<uint32_t>() || DeskAppPolicy::boundedText(d["weather"] | "", 64));
}
static void remember(JsonVariantConst d) {
  saved.has = true; saved.seconds = d["seconds"].as<bool>(); saved.full = !std::strcmp(d["mode"] | "", "fullscreen");
  std::snprintf(saved.id, sizeof saved.id, "%s", d["id"] | ""); std::snprintf(saved.place, sizeof saved.place, "%s", d["place"] | "");
  std::snprintf(saved.zone, sizeof saved.zone, "%s", d["timezone"] | ""); std::snprintf(saved.weather, sizeof saved.weather, "%s", d["weather"] | "");
  saved.weatherEpoch = d["weather_epoch"].as<uint32_t>(); saved.ttl = d["weather_ttl_ms"].as<uint32_t>();
}
void attachStore(SaveFn save, LoadFn load) {
  saveFn = save; loadFn = load; saved = Saved{}; persisted = false;
  if (!loadFn) return;
  static char buf[512];
  const size_t n = loadFn(buf, sizeof buf - 1);
  if (!n || n >= sizeof buf - 1) return;  // missing or oversized file: ignore, never partially load
  buf[n] = 0;
  JsonDocument d;
  if (deserializeJson(d, buf) || !validSaved(d.as<JsonVariantConst>())) return;
  remember(d.as<JsonVariantConst>()); persisted = true;
}
bool hasSaved() { return saved.has; }
const char* savedPlace() { return saved.has ? saved.place : ""; }
bool fullscreen() { return state.fullscreen(); }
bool widgetVisible() { return state.widget(); }
void stopFullscreen() { if (state.mode == DeskAppPolicy::Mode::Fullscreen) state.stop(); }
void stop() { state.stop(); }
void update(bool busy) { state.update(millis(), busy); }
void status(JsonDocument& out) {
  out["ok"] = true; out["supported"] = true; out["version"] = 1;
  out["active"] = state.mode != DeskAppPolicy::Mode::Off;
  out["mode"] = state.mode == DeskAppPolicy::Mode::Widget ? "widget" : state.mode == DeskAppPolicy::Mode::Fullscreen ? "fullscreen" : "off";
  out["id"] = state.mode == DeskAppPolicy::Mode::Off ? "" : id;
  out["suspended"] = state.suspended;
  out["weather_remaining_ms"] = state.remaining(millis());
  out["persistent"] = persisted;
  out["saved"] = saved.has;
  out["saved_place"] = savedPlace();
}
int handle(JsonVariantConst in, JsonDocument& out, bool busy) {
  const char* action = in["action"] | "";
  if (!std::strcmp(action, "stop")) { state.stop(); status(out); return 200; }
  const char* nextId = in["id"] | "";
  const char* nextPlace = in["place"] | "";
  const char* nextZone = in["timezone"] | "";
  const char* nextMode = in["mode"] | "";
  const char* nextWeather = in["weather"] | "";
  auto fail = [&](int code, const char* message) { out["ok"] = false; out["error"] = message; return code; };
  if (std::strcmp(action, "start") || !in["version"].is<int>() || in["version"].as<int>() != 1 ||
      !in["seconds"].is<bool>() || !in["epoch"].is<uint32_t>() || !in["weather_ttl_ms"].is<uint32_t>() ||
      !DeskAppPolicy::boundedText(nextId, 80) || !DeskAppPolicy::boundedText(nextPlace, 48) ||
      !DeskAppPolicy::zoneSupported(nextZone) ||
      (std::strcmp(nextMode, "widget") && std::strcmp(nextMode, "fullscreen")) ||
      !ClockPolicy::valid(in["epoch"].as<uint32_t>()) || in["weather_ttl_ms"].as<uint32_t>() > DeskAppPolicy::weatherMaxMs ||
      (in["weather_ttl_ms"].as<uint32_t>() && !DeskAppPolicy::boundedText(nextWeather, 64)))
    return fail(400, "invalid_clock_app_or_unsupported_timezone");
  if (busy) return fail(409, "stop_voice_camera_menu_or_test_first");
  // Validate text against the same font BEFORE accepting; never report clipped content as success.
  M5Canvas measure; measure.setFont(&fonts::efontJA_16); measure.setTextSize(1);
  if (measure.textWidth(nextPlace) > 300 || (in["weather_ttl_ms"].as<uint32_t>() && measure.textWidth(nextWeather) > 300))
    return fail(400, "app_text_does_not_fit_screen");
  std::snprintf(id, sizeof id, "%s", nextId); std::snprintf(place, sizeof place, "%s", nextPlace);
  std::snprintf(zone, sizeof zone, "%s", nextZone); std::snprintf(weather, sizeof weather, "%s", nextWeather);
  epoch = in["epoch"].as<uint32_t>(); seconds = in["seconds"].as<bool>(); lastDraw = 0;
  state.start(!std::strcmp(nextMode, "widget") ? DeskAppPolicy::Mode::Widget : DeskAppPolicy::Mode::Fullscreen,
              millis(), in["weather_ttl_ms"].as<uint32_t>());
  // Persist the accepted configuration once per start; a failed write keeps the running app.
  JsonDocument rec;
  rec["version"] = 1; rec["id"] = id; rec["mode"] = nextMode; rec["seconds"] = seconds; rec["place"] = place;
  rec["timezone"] = zone; rec["weather"] = weather; rec["weather_epoch"] = static_cast<uint32_t>(epoch);
  rec["weather_ttl_ms"] = in["weather_ttl_ms"].as<uint32_t>();
  remember(rec.as<JsonVariantConst>());
  char buf[512]; const size_t n = serializeJson(rec, buf, sizeof buf);
  persisted = saveFn && n && n < sizeof buf - 1 && saveFn(buf);
  status(out); return 200;
}
const char* startSaved(bool full, std::time_t now) {
  if (!saved.has) return "Ingen sparad app";
  if (now < 0 || !ClockPolicy::valid(static_cast<uint32_t>(now))) return "Klockan ej satt";
  std::snprintf(id, sizeof id, "%s", saved.id); std::snprintf(place, sizeof place, "%s", saved.place);
  std::snprintf(zone, sizeof zone, "%s", saved.zone); std::snprintf(weather, sizeof weather, "%s", saved.weather);
  epoch = now; seconds = saved.seconds; lastDraw = 0;
  // Weather only counts as current for what remains of its original TTL, measured by wall time.
  uint32_t ttl = 0;
  const std::time_t until = static_cast<std::time_t>(saved.weatherEpoch) + saved.ttl / 1000;
  if (saved.ttl && now >= static_cast<std::time_t>(saved.weatherEpoch) && now < until) ttl = static_cast<uint32_t>(until - now) * 1000;
  state.start(full ? DeskAppPolicy::Mode::Fullscreen : DeskAppPolicy::Mode::Widget, millis(), ttl);
  return nullptr;
}
static void clock(char* clock, size_t n, char* date, size_t dn) {
  const auto current = epoch + uint32_t(millis() - state.started) / 1000;
  char iso[32]{}; int offset = 0;
  if (!ClockPolicy::format(current, zone, iso, sizeof iso, offset)) {
    std::snprintf(clock, n, "--:--"); std::snprintf(date, dn, "Tid ej tillgänglig"); return;
  }
  std::snprintf(clock, n, seconds ? "%.8s" : "%.5s", iso + 11);
  std::snprintf(date, dn, "%.10s", iso);
}
static void line(M5Canvas& c, const char* text, int y, int scale, uint16_t color) {
  c.setFont(&fonts::efontJA_16); c.setTextSize(scale); c.setTextColor(color, TFT_BLACK); c.setTextWrap(false);
  c.setCursor((c.width() - c.textWidth(text)) / 2, y); c.print(text);
}
bool drawFullscreen(M5Canvas& c) {
  if (!fullscreen()) return false;
  const uint32_t now = millis();
  if (lastDraw && uint32_t(now - lastDraw) < 1000) return true;
  lastDraw = now;
  char time[16]{}, date[32]{}; clock(time, sizeof time, date, sizeof date);
  c.fillSprite(TFT_BLACK);
  line(c, date, 22, 1, TFT_WHITE);
  line(c, time, 70, seconds ? 3 : 4, TFT_CYAN);
  c.drawFastHLine(10, 156, c.width()-20, TFT_DARKCYAN);
  line(c, place, 169, 1, TFT_WHITE);
  line(c, state.fresh(now) ? weather : "Väder ej aktuellt", 200, 1, TFT_WHITE);
  return true;
}
void drawWidget(M5Canvas& c) {
  if (!widgetVisible()) return;
  char time[16]{}, date[32]{}; clock(time, sizeof time, date, sizeof date);
  const int y = c.height() - 70;
  c.fillRect(0, y, c.width(), 70, TFT_BLACK);
  c.drawFastHLine(10, y, c.width()-20, TFT_DARKCYAN);
  line(c, time, y+3, 1, TFT_CYAN);
  line(c, place, y+25, 1, TFT_WHITE);
  line(c, state.fresh(millis()) ? weather : "Väder ej aktuellt", y+47, 1, TFT_WHITE);
}
}