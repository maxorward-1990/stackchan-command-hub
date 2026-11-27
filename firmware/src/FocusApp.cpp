#include "FocusApp.h"
#include "PomodoroPolicy.h"
#include <Arduino.h>
#include <cstdio>
#include <cstring>
namespace FocusApp {
using PomodoroPolicy::Phase;
enum class View { Hidden, Widget, Full };
static PomodoroPolicy::Timer timer;
static View view = View::Hidden, wanted = View::Hidden;
static bool simpleTimer = false;
static bool suspended = false, persisted = false, hasSaved = false, savedFull = false;
static int sFocusSec = 25 * 60, sBreak = 5, sRounds = 4;
static uint32_t lastDraw = 0, cueUntil = 0;
static SaveFn saveFn = nullptr;
static char summaryBuf[32]{};
constexpr uint32_t kDoneShowMs = 60000, kCueMs = 3000;
static bool validSaved(JsonVariantConst d) {
  return d["version"].is<int>() && d["version"].as<int>() == 1 && d["focus_min"].is<int>() && d["break_min"].is<int>() && d["rounds"].is<int>() &&
      PomodoroPolicy::valid(d["focus_min"].as<int>(), d["break_min"].as<int>(), d["rounds"].as<int>()) &&
      (!std::strcmp(d["mode"] | "", "widget") || !std::strcmp(d["mode"] | "", "fullscreen"));
}
static void remember(JsonVariantConst d) {
  hasSaved = true; sFocusSec = d["focus_min"].as<int>() * 60;
  if (d["focus_sec"].is<int>() && PomodoroPolicy::validSec(d["focus_sec"].as<int>(), d["break_min"].as<int>(), d["rounds"].as<int>())) sFocusSec = d["focus_sec"].as<int>();
  sBreak = d["break_min"].as<int>(); sRounds = d["rounds"].as<int>();
  savedFull = !std::strcmp(d["mode"] | "", "fullscreen");
}
void attachStore(SaveFn save, LoadFn load) {
  saveFn = save; hasSaved = false; persisted = false;
  if (!load) return;
  static char buf[256];
  const size_t n = load(buf, sizeof buf - 1);
  if (!n || n >= sizeof buf - 1) return;
  buf[n] = 0;
  JsonDocument d;
  if (deserializeJson(d, buf) || !validSaved(d.as<JsonVariantConst>())) return;
  remember(d.as<JsonVariantConst>()); persisted = true;
}
bool running() { return timer.phase != Phase::Off; }
bool paused() { return timer.paused; }
bool fullscreen() { return running() && view == View::Full && !suspended; }
bool widgetVisible() { return running() && view == View::Widget && !suspended; }
void stop() { timer.stop(); view = wanted = View::Hidden; suspended = false; }
void leaveFullscreen() { if (view == View::Full) { view = View::Widget; lastDraw = 0; } }
void togglePause() { if (timer.paused) timer.resume(millis()); else timer.pause(millis()); lastDraw = 0; }
void update(bool busy) {
  const uint32_t now = millis();
  if (timer.tick(now)) { cueUntil = now + kCueMs; lastDraw = 0; Serial.printf("Focus: phase %d round %d\n", int(timer.phase), timer.round); }
  if (timer.phase == Phase::Done && uint32_t(now - timer.doneAt) >= kDoneShowMs) { stop(); return; }
  if (busy && view == View::Full) view = View::Widget;  // voice/menu/camera win the screen; timer continues
  suspended = busy;
}
const char* summary() {
  if (sFocusSec % 60) std::snprintf(summaryBuf, sizeof summaryBuf, "%ds/%d min · %d pass", sFocusSec, sBreak, sRounds);
  else std::snprintf(summaryBuf, sizeof summaryBuf, "%d/%d min · %d pass", sFocusSec / 60, sBreak, sRounds);
  return summaryBuf;
}
static const char* phaseName() {
  switch (timer.phase) { case Phase::Focus: return "focus"; case Phase::Break: return "break"; case Phase::Done: return "done"; default: return "off"; }
}
void status(JsonDocument& out) {
  out["ok"] = true; out["supported"] = true; out["version"] = 1;
  out["phase"] = phaseName(); out["paused"] = timer.paused;
  out["round"] = timer.round; out["rounds"] = running() ? timer.rounds : sRounds;
  out["remaining_ms"] = timer.remaining;
  out["mode"] = !running() ? "off" : view == View::Full ? "fullscreen" : "widget";
  out["suspended"] = suspended;
  out["kind"] = simpleTimer ? "timer" : "pomodoro";
  out["saved"] = hasSaved; out["persistent"] = persisted;
  out["focus_min"] = (sFocusSec + 59) / 60; out["focus_sec"] = sFocusSec; out["break_min"] = sBreak;
}
static void begin(int fs, int b, int r, bool full) {
  timer.startSec(fs, b, r, millis()); simpleTimer = false;
  view = wanted = full ? View::Full : View::Widget; suspended = false; lastDraw = 0; cueUntil = 0;
}
int handle(JsonVariantConst in, JsonDocument& out, bool busy) {
  const char* action = in["action"] | "";
  auto fail = [&](int code, const char* message) { out["ok"] = false; out["error"] = message; return code; };
  if (!std::strcmp(action, "stop")) { stop(); status(out); return 200; }
  if (!std::strcmp(action, "pause") || !std::strcmp(action, "resume")) {
    if (!timer.active()) return fail(409, "focus_timer_not_running");
    if (!std::strcmp(action, "pause")) timer.pause(millis()); else timer.resume(millis());
    lastDraw = 0; status(out); return 200;
  }
  const char* mode = in["mode"] | "";
  if (std::strcmp(action, "start") || !in["version"].is<int>() || in["version"].as<int>() != 1 ||
      !in["focus_min"].is<int>() || !in["break_min"].is<int>() || !in["rounds"].is<int>() ||
      !PomodoroPolicy::valid(in["focus_min"].as<int>(), in["break_min"].as<int>(), in["rounds"].as<int>()) ||
      (std::strcmp(mode, "widget") && std::strcmp(mode, "fullscreen")))
    return fail(400, "invalid_focus_timer");
  if (busy) return fail(409, "stop_voice_camera_menu_or_test_first");
  JsonDocument rec;
  rec["version"] = 1; rec["focus_min"] = in["focus_min"].as<int>(); rec["break_min"] = in["break_min"].as<int>();
  rec["rounds"] = in["rounds"].as<int>(); rec["mode"] = mode;
  remember(rec.as<JsonVariantConst>());
  begin(sFocusSec, sBreak, sRounds, savedFull);
  char buf[256]; const size_t n = serializeJson(rec, buf, sizeof buf);
  persisted = saveFn && n && n < sizeof buf - 1 && saveFn(buf);
  status(out); return 200;
}
bool simple() { return simpleTimer; }
static void persist() {
  JsonDocument rec;
  rec["version"] = 1; rec["focus_min"] = (sFocusSec + 59) / 60; rec["focus_sec"] = sFocusSec; rec["break_min"] = sBreak; rec["rounds"] = sRounds; rec["mode"] = savedFull ? "fullscreen" : "widget";
  char buf[256]; const size_t n = serializeJson(rec, buf, sizeof buf);
  persisted = saveFn && n && n < sizeof buf - 1 && saveFn(buf);
}
void adjustFocus(int dir) {
  sFocusSec = PomodoroPolicy::stepSeconds(sFocusSec, dir); hasSaved = true; persist();
}
int voice(JsonVariantConst in, JsonDocument& out) {
  const char* action = in["action"] | "";
  auto fail = [&](const char* e, const char* m) { out["ok"] = false; out["error"] = e; out["message"] = m; return 400; };
  if (!std::strcmp(action, "start")) {
    const bool hasMin = in["minutes"].is<int>(), hasSec = in["seconds"].is<int>();
    const int total = (hasMin ? in["minutes"].as<int>() * 60 : 0) + (hasSec ? in["seconds"].as<int>() : 0);
    if ((!hasMin && !hasSec) || (hasMin && in["minutes"].as<int>() < 0) || (hasSec && in["seconds"].as<int>() < 0) || !timer.startSec(total, 1, 1, millis()))
      return fail("invalid_duration", "Give minutes and/or seconds; total must be 10 seconds to 90 minutes. Tell the user the limit.");
    simpleTimer = true;
    const int min = total;
    view = wanted = View::Widget; lastDraw = 0; cueUntil = 0;
    Serial.printf("Focus: voice timer %d s\n", min);
  } else if (!std::strcmp(action, "stop")) { stop();
  } else if (!std::strcmp(action, "pause") || !std::strcmp(action, "resume")) {
    if (!timer.active()) return fail("no_timer_running", "No timer is running.");
    if (!std::strcmp(action, "pause")) timer.pause(millis()); else timer.resume(millis());
    lastDraw = 0;
  } else if (std::strcmp(action, "status")) return fail("invalid_action", "Use start, stop, pause, resume or status.");
  status(out);
  out["message"] = !std::strcmp(action, "start") ? "Timer running as a widget at the bottom of the screen. It shows when the conversation ends; the robot cannot ring, so do not promise a sound." : "";
  return 200;
}
const char* startSaved(bool full) {
  begin(sFocusSec, sBreak, sRounds, full);
  return nullptr;
}
static void mmss(char* b, size_t n) {
  const uint32_t s = (timer.remaining + 999) / 1000;
  std::snprintf(b, n, "%02u:%02u", unsigned(s / 60), unsigned(s % 60));
}
static void line(M5Canvas& c, const char* text, int y, int scale, uint16_t color) {
  c.setFont(&fonts::efontJA_16); c.setTextSize(scale); c.setTextColor(color, TFT_BLACK); c.setTextWrap(false);
  c.setCursor((c.width() - c.textWidth(text)) / 2, y); c.print(text);
}
static const char* label() {
  if (timer.phase == Phase::Done) return simpleTimer ? "Tiden är ute" : "Klart! Bra jobbat";
  if (timer.paused) return "Pausad";
  if (simpleTimer) return "Timer";
  return timer.phase == Phase::Focus ? "Fokus" : "Paus";
}
bool drawFullscreen(M5Canvas& c) {
  if (!fullscreen()) return false;
  const uint32_t now = millis();
  if (lastDraw && uint32_t(now - lastDraw) < 1000) return true;
  lastDraw = now;
  const bool cue = int32_t(cueUntil - now) > 0;
  const uint16_t accent = timer.phase == Phase::Break ? TFT_GREEN : TFT_ORANGE;
  char head[40], time[8]; mmss(time, sizeof time);
  if (simpleTimer) std::snprintf(head, sizeof head, "%s", label()); else std::snprintf(head, sizeof head, "%s · pass %d/%d", label(), timer.round, timer.rounds);
  c.fillSprite(TFT_BLACK);
  if (cue) c.drawRect(2, 2, c.width() - 4, c.height() - 4, accent);
  line(c, head, 24, 1, TFT_WHITE);
  line(c, timer.phase == Phase::Done ? "00:00" : time, 70, 4, accent);
  const int w = c.width() - 40;
  c.drawRect(20, 180, w, 14, TFT_DARKGREY);
  c.fillRect(22, 182, (w - 4) * timer.progressPermille() / 1000, 10, accent);
  line(c, "Tryck: tillbaka till ansiktet", 210, 1, TFT_DARKGREY);
  return true;
}
void drawWidget(M5Canvas& c) {
  if (!widgetVisible()) return;
  char time[8], text[48]; mmss(time, sizeof time);
  const uint16_t accent = timer.phase == Phase::Break ? TFT_GREEN : TFT_ORANGE;
  if (simpleTimer) std::snprintf(text, sizeof text, "%s", label()); else std::snprintf(text, sizeof text, "%s · %d/%d", label(), timer.round, timer.rounds);
  const int y = c.height() - 70;
  c.fillRect(0, y, c.width(), 70, TFT_BLACK);
  c.drawFastHLine(10, y, c.width() - 20, accent);
  line(c, timer.phase == Phase::Done ? "00:00" : time, y + 4, 2, accent);
  line(c, text, y + 40, 1, TFT_WHITE);
}
}  // namespace FocusApp
