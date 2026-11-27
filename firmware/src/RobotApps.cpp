#include "RobotApps.h"
#include <M5Unified.h>
#include <M5StackChan.h>
#include <SD.h>
#include <SPI.h>
#include <mbedtls/base64.h>
#include <ctime>
#include <new>
#include "RobotAppPolicy.h"
#include "RobotAppPlayer.h"
#include "LiveSetupMemory.h"
#include "ClockPolicy.h"
#include "ScreenImage.h"
#include "SmartHome.h"
#include "TodoStore.h"
#include "FocusApp.h"
#include "DeskApp.h"
#include "CameraStream.h"
#include "DiagnosticMode.h"
#include "GeminiLiveProbe.h"
#include "EmotionController.h"
#include "ServoGestureController.h"

extern GeminiLiveProbe gemini;
extern EmotionController emotion;
extern ServoGestureController servoGestures;
bool robotAppsReadLtr553(uint32_t& ps, uint32_t& als);  // WebConfigServer.cpp (same LTR-553 reads as /api/sensors)

namespace {
using namespace RobotAppPolicy;
constexpr const char* kDir = "/rapps";
constexpr const char* kTmp = "/rapps/tmp";
constexpr const char* kSdDir = "/stackchan-apps";
constexpr uint32_t kSensorPollMs = 500, kClockPollMs = 5000;

fs::FS* g_fs = nullptr;
bool g_sdBoot = false;
LiveSetupAllocator g_alloc;           // all JSON and file buffers in PSRAM, never TLS's internal heap
JsonDocument* g_run = nullptr;        // the playing app (owns the steps the player reads)
AppMeta* g_meta = nullptr;            // kMaxApps entries in PSRAM
int g_count = 0;
size_t g_bytes = 0;
uint8_t* g_chunk = nullptr;           // decoded upload chunk / copy buffer (PSRAM)
constexpr size_t kChunkBytes = kChunkBase64Max / 4 * 3 + 4;
RobotAppPlayer::Player g_player;
String g_lastError, g_runOrigin;

struct Pending { int index = -1; String origin; uint32_t since = 0, idleSince = 0; bool stopSent = false; } g_pending;
constexpr uint32_t kSettleMs = 1500;  // let a just-ended conversation finish closing before the app talks
Edge g_edges[kMaxApps][kMaxTriggers];
uint32_t g_lastRun[kMaxApps] = {}; bool g_everRun[kMaxApps] = {};
uint32_t g_firedUtt[kMaxApps] = {}; long g_firedMinute[kMaxApps] = {};
UtteranceJoiner g_joiner;
uint32_t g_lastSensor = 0, g_lastClock = 0;

String path(const char* dir, const char* file) { return String(dir) + "/" + file; }
const char* baseName(const char* p) { const char* s = std::strrchr(p, '/'); return s ? s + 1 : p; }

/** Reads a whole file into a PSRAM buffer (caller frees with heap_caps_free). */
uint8_t* readAll(fs::FS& fs, const String& p, size_t maxBytes, size_t& n) {
  n = 0;
  File f = fs.open(p, "r");
  if (!f || f.isDirectory()) return nullptr;
  const size_t sz = f.size();
  if (sz == 0 || sz > maxBytes) { f.close(); return nullptr; }
  uint8_t* buf = static_cast<uint8_t*>(heap_caps_malloc(sz + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!buf) { f.close(); return nullptr; }
  n = f.read(buf, sz); f.close();
  if (n != sz) { heap_caps_free(buf); n = 0; return nullptr; }
  buf[n] = 0;
  return buf;
}
bool parseApp(fs::FS& fs, const String& p, JsonDocument& doc) {
  size_t n; uint8_t* buf = readAll(fs, p, kMaxJsonBytes, n);
  if (!buf) return false;
  const bool ok = !deserializeJson(doc, reinterpret_cast<const char*>(buf), n);
  heap_caps_free(buf);
  return ok && validate(doc.as<JsonVariantConst>()) == nullptr;
}
size_t fileSize(fs::FS& fs, const String& p) { File f = fs.open(p, "r"); if (!f) return 0; size_t s = f.isDirectory() ? 0 : f.size(); f.close(); return s; }
size_t appBytes(const char* id) {
  size_t total = fileSize(*g_fs, path(kDir, (String(id) + ".json").c_str()));
  char f[kIdMax + 16];
  for (int i = 0; i < kMaxSteps; ++i) { imageFile(id, i, f, sizeof f); total += fileSize(*g_fs, path(kDir, f)); }
  return total;
}
void removeApp(fs::FS& fs, const char* dir, const char* id) {
  fs.remove(path(dir, (String(id) + ".json").c_str()));
  char f[kIdMax + 16];
  for (int i = 0; i < kMaxSteps; ++i) { imageFile(id, i, f, sizeof f); String p = path(dir, f); if (fs.exists(p)) fs.remove(p); }
}

void reindex() {
  g_count = 0; g_bytes = 0;
  if (!g_fs || !g_meta) return;
  File dir = g_fs->open(kDir);
  if (!dir || !dir.isDirectory()) return;
  JsonDocument doc(&g_alloc);
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    if (f.isDirectory()) { f.close(); continue; }
    String name = baseName(f.name());
    g_bytes += f.size();
    f.close();
    char id[kIdMax + 1];
    if (parseFileName(name.c_str(), id, sizeof id) != FileKind::Json || g_count >= kMaxApps) continue;
    doc.clear();
    AppMeta m;
    if (!parseApp(*g_fs, path(kDir, name.c_str()), doc) || !readMeta(doc.as<JsonVariantConst>(), m) || std::strcmp(m.id, id)) {
      Serial.printf("[APP] ignored invalid %s\n", name.c_str());
      continue;
    }
    int at = g_count++;  // keep the list sorted by name for the menu and voice
    while (at > 0 && std::strcmp(g_meta[at - 1].name, m.name) > 0) { g_meta[at] = g_meta[at - 1]; --at; }
    g_meta[at] = m;
  }
  dir.close();
  for (auto& row : g_edges) for (auto& e : row) e = Edge{};
  Serial.printf("[APP] %d apps, %u bytes\n", g_count, static_cast<unsigned>(g_bytes));
}
int indexOf(const char* id) { for (int i = 0; i < g_count; ++i) if (!std::strcmp(g_meta[i].id, id)) return i; return -1; }

// ---- Hardware behind the pure player ----
struct DeviceEnv : RobotAppPlayer::Env {
  uint32_t now() override { return millis(); }
  bool led(const char* mode, uint8_t r, uint8_t g, uint8_t b) override { return ::emotion.setLedOverride(String(mode), r, g, b); }
  bool emotion(const char* n) override { return ::emotion.setEmotion(String(n)); }
  bool gesture(const char* n) override { return servoGestures.queueGesture(String(n)); }
  bool look(int x, int y) override { M5StackChan.Motion.move(x, y, 600); return true; }
  bool motionBusy() override { return servoGestures.active() || M5StackChan.Motion.isMoving(); }
  bool showText(const char* text) override { JsonDocument d; d["type"] = "text"; d["text"] = text; return ScreenImage::showInformation(d.as<JsonVariantConst>()); }
  bool showImage(const char* file) override {
    size_t n; uint8_t* buf = readAll(*g_fs, path(kDir, file), kMaxImageBytes, n);
    if (!buf) return false;
    const bool ok = ScreenImage::showJpeg(buf, n);
    heap_caps_free(buf);
    return ok;
  }
  void clearScreen() override { ScreenImage::clear(); ::emotion.forceRedraw(); }
  bool requestText(const char* text) override { return gemini.requestTextTurn(String(text)); }
  bool speaking() override { return gemini.isSpeaking() || M5.Speaker.isPlaying(); }
  bool speechIdle() override { return !gemini.isConnecting() && !gemini.canInterrupt() && !gemini.toolPending(); }
  bool lightsStart(const char* action, const char* target) override {
    if (!SmartHome::available() || SmartHome::busy() || gemini.toolPending()) return false;
    JsonDocument a; a["action"] = action; a["target"] = target;
    return SmartHome::startControl(a.as<JsonVariantConst>());
  }
  int lightsPoll() override {
    if (SmartHome::busy()) return 0;
    String r;
    if (!SmartHome::takeResult(r)) return 1;  // finished; result already taken elsewhere
    JsonDocument d;
    if (deserializeJson(d, r)) return 1;
    return (d["ok"] | true) && d["failed"].size() == 0 ? 1 : -1;
  }
  bool todoAdd(const char* text) override { JsonDocument in, out; in["action"] = "add"; in["text"] = text; return TodoStore::handle(in.as<JsonVariantConst>(), out) == 200; }
  bool timerStart(int minutes) override {
    JsonDocument in, out; in["action"] = "start"; in["minutes"] = minutes;
    if (FocusApp::voice(in.as<JsonVariantConst>(), out) != 200) return false;
    DeskApp::stop();
    return true;
  }
  void stopTalk() override { gemini.stopConversation(); }
  void resetLook() override { RobotApps::resetLook(); }
} g_env;

void beginRun(int index) {
  g_pending = Pending{};
  if (index < 0 || index >= g_count || !g_run) return;
  const AppMeta& m = g_meta[index];
  g_run->clear();
  if (!parseApp(*g_fs, path(kDir, (String(m.id) + ".json").c_str()), *g_run)) { g_lastError = String(m.name) + ": appfilen kunde inte läsas"; Serial.printf("[APP] %s\n", g_lastError.c_str()); return; }
  g_lastRun[index] = millis(); g_everRun[index] = true;
  g_lastError = "";
  g_player.start((*g_run)["actions"].as<JsonArrayConst>(), m.name);
  Serial.printf("[APP] start \"%s\" (%s) steps=%u\n", m.name, g_runOrigin.c_str(), static_cast<unsigned>(m.steps));
}
/** Automatic starts respect the cooldown; manual ones (menu, Hub, voice tool) do not. */
void queue(int index, const char* origin, bool automatic) {
  if (index < 0 || index >= g_count || g_player.running() || g_pending.index >= 0) return;
  if (automatic && !mayStart(g_meta[index].cooldown, g_everRun[index], g_lastRun[index], millis())) return;
  g_pending.index = index; g_pending.origin = origin; g_pending.since = millis(); g_pending.stopSent = false;
  g_runOrigin = origin;
  Serial.printf("[APP] queued \"%s\" (%s)\n", g_meta[index].name, origin);
}

void pollTriggers(bool busy) {
  const uint32_t now = millis();
  if (busy) for (auto& row : g_edges) for (auto& e : row) e = Edge{};
  static uint32_t lastSensorLog = 0;  // v86: show sensor apps' readings at most every 10 s, so thresholds can be checked in the log
  // Clock (also while busy: the start waits for the conversation to end).
  if (now - g_lastClock >= kClockPollMs) {
    g_lastClock = now;
    const std::time_t t = std::time(nullptr);
    if (ClockPolicy::valid(t)) {
      std::tm utc{}; gmtime_r(&t, &utc);
      int minutes = 0;
      if (ClockPolicy::offset("Europe/Stockholm", utc, minutes)) {
        const std::time_t lt = t + minutes * 60; std::tm local{}; gmtime_r(&lt, &local);
        const long key = static_cast<long>(lt / 60);
        for (int a = 0; a < g_count; ++a) {
          if (!g_meta[a].enabled || g_firedMinute[a] == key) continue;
          for (int i = 0; i < g_meta[a].triggerCount; ++i)
            if (timeMatches(g_meta[a].t[i], local.tm_hour, local.tm_min, local.tm_wday)) { g_firedMinute[a] = key; queue(a, "klockslag", true); break; }
        }
      }
    }
  }
  if (busy) return;
  if (now - g_lastSensor < kSensorPollMs || CameraStream::active()) return;
  bool wanted = false;
  for (int a = 0; a < g_count && !wanted; ++a)
    for (int i = 0; i < g_meta[a].triggerCount; ++i) if (g_meta[a].enabled && (g_meta[a].t[i].kind == Trig::Near || g_meta[a].t[i].kind == Trig::Light)) wanted = true;
  if (!wanted) return;
  g_lastSensor = now;
  uint32_t psRaw = 0, alsAvg = 0;
  const bool known = robotAppsReadLtr553(psRaw, alsAvg);
  if (now - lastSensorLog >= 10000) { lastSensorLog = now; Serial.printf("[APP] sensors ok=%d near=%u light=%u\n", known, static_cast<unsigned>(psRaw), static_cast<unsigned>(alsAvg)); }
  for (int a = 0; a < g_count; ++a) {
    if (!g_meta[a].enabled) continue;
    for (int i = 0; i < g_meta[a].triggerCount; ++i) {
      const TriggerMeta& t = g_meta[a].t[i];
      if (t.kind != Trig::Near && t.kind != Trig::Light) continue;
      if (g_edges[a][i].update(known, sensorActive(t, psRaw, alsAvg))) queue(a, t.kind == Trig::Near ? "nära" : (t.dark ? "mörkt" : "ljust"), true);
    }
  }
}

// ---- Upload / install ----
int fail(JsonDocument& out, int code, const char* error) { out["ok"] = false; out["error"] = error; return code; }

int upload(JsonVariantConst in, JsonDocument& out) {
  const char* file = in["file"] | "";
  char id[kIdMax + 1];
  const FileKind kind = parseFileName(file, id, sizeof id);
  if (kind == FileKind::Invalid) return fail(out, 400, "invalid_file");
  const long total = in["total"] | 0L, offset = in["offset"] | -1L;
  const size_t max = kind == FileKind::Json ? kMaxJsonBytes : kMaxImageBytes;
  const char* data = in["data"] | "";
  const size_t len = std::strlen(data);
  if (total < 1 || static_cast<size_t>(total) > max || offset < 0 || len == 0 || len > kChunkBase64Max) return fail(out, 400, "invalid_chunk");
  if (!g_chunk) return fail(out, 507, "no_memory");
  size_t n = 0;
  if (mbedtls_base64_decode(g_chunk, kChunkBytes, &n, reinterpret_cast<const unsigned char*>(data), len) != 0) return fail(out, 400, "invalid_base64");
  if (static_cast<size_t>(offset) + n > static_cast<size_t>(total)) return fail(out, 400, "chunk_past_total");
  g_fs->mkdir(kDir); g_fs->mkdir(kTmp);
  const String p = path(kTmp, file);
  const size_t have = offset == 0 ? 0 : fileSize(*g_fs, p);
  if (static_cast<size_t>(offset) != have) { out["expected_offset"] = have; return fail(out, 409, "wrong_offset"); }
  File f = g_fs->open(p, offset == 0 ? "w" : "a");
  if (!f) return fail(out, 507, "storage_write_failed");
  const size_t w = f.write(g_chunk, n); f.close();
  if (w != n) return fail(out, 507, "storage_full");
  out["ok"] = true; out["received"] = offset + static_cast<long>(n); out["complete"] = offset + static_cast<long>(n) == total;
  return 200;
}

/** Validates the uploaded app and its images in /rapps/tmp and moves them into place. */
const char* install(const char* id) {
  if (!validId(id)) return "invalid_id";
  JsonDocument doc(&g_alloc);
  if (!parseApp(*g_fs, path(kTmp, (String(id) + ".json").c_str()), doc)) return "invalid_app";
  if (std::strcmp(doc["id"] | "", id)) return "id_mismatch";
  size_t bytes = fileSize(*g_fs, path(kTmp, (String(id) + ".json").c_str()));
  for (JsonVariantConst a : doc["actions"].as<JsonArrayConst>()) {
    if (std::strcmp(a["kind"] | "", "image")) continue;
    const String p = path(kTmp, a["file"] | "");
    File f = g_fs->open(p, "r");
    if (!f) return "missing_image";
    uint8_t head[2] = {}; const size_t sz = f.size(); f.read(head, 2); f.close();
    if (sz < 4 || sz > kMaxImageBytes || head[0] != 0xFF || head[1] != 0xD8) return "invalid_image";
    bytes += sz;
  }
  const bool existing = indexOf(id) >= 0;
  if (!existing && g_count >= kMaxApps) return "too_many_apps";
  if (g_bytes - (existing ? appBytes(id) : 0) + bytes > kMaxTotalBytes) return "storage_limit";
  if (g_player.running() && !std::strcmp(g_player.name(), doc["name"] | "")) g_player.stop("Appen ersattes.");
  removeApp(*g_fs, kDir, id);
  const String json = String(id) + ".json";
  if (!g_fs->rename(path(kTmp, json.c_str()), path(kDir, json.c_str()))) return "storage_write_failed";
  for (JsonVariantConst a : doc["actions"].as<JsonArrayConst>()) {
    if (std::strcmp(a["kind"] | "", "image")) continue;
    const char* f = a["file"];
    if (g_fs->exists(path(kTmp, f))) g_fs->rename(path(kTmp, f), path(kDir, f));
  }
  removeApp(*g_fs, kTmp, id);  // unused leftovers
  reindex();
  Serial.printf("[APP] installed %s (%u bytes)\n", id, static_cast<unsigned>(bytes));
  return nullptr;
}

const char* setEnabled(const char* id, bool enabled) {
  if (!validId(id) || indexOf(id) < 0) return "unknown_app";
  JsonDocument doc(&g_alloc);
  const String p = path(kDir, (String(id) + ".json").c_str()), tmp = path(kTmp, "enable.json");
  if (!parseApp(*g_fs, p, doc)) return "invalid_app";
  doc["enabled"] = enabled;
  g_fs->mkdir(kTmp);
  File f = g_fs->open(tmp, "w");
  if (!f) return "storage_write_failed";
  const size_t n = serializeJson(doc, f); f.close();
  if (!n) return "storage_write_failed";
  g_fs->remove(p);
  if (!g_fs->rename(tmp, p)) return "storage_write_failed";
  reindex();
  return nullptr;
}

bool copyFile(fs::FS& from, const String& src, const String& dst, size_t maxBytes) {
  File in = from.open(src, "r");
  if (!in || in.isDirectory() || in.size() == 0 || in.size() > maxBytes || !g_chunk) { if (in) in.close(); return false; }
  File out = g_fs->open(dst, "w");
  if (!out) { in.close(); return false; }
  bool ok = true;
  while (ok && in.available()) { const size_t n = in.read(g_chunk, kChunkBytes); ok = n > 0 && out.write(g_chunk, n) == n; }
  in.close(); out.close();
  return ok;
}
}  // namespace

namespace RobotApps {
void begin(fs::FS& storage, bool sdIsStorage) {
  g_fs = &storage; g_sdBoot = sdIsStorage;
  g_meta = static_cast<AppMeta*>(heap_caps_malloc(sizeof(AppMeta) * kMaxApps, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  g_chunk = static_cast<uint8_t*>(heap_caps_malloc(kChunkBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  void* runMem = heap_caps_malloc(sizeof(JsonDocument), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!g_meta || !g_chunk || !runMem) { Serial.println("[APP] disabled: no PSRAM"); g_meta = nullptr; return; }
  for (int i = 0; i < kMaxApps; ++i) new (&g_meta[i]) AppMeta();
  g_run = new (runMem) JsonDocument(&g_alloc);
  g_fs->mkdir(kDir);
  reindex();
}

void loop(bool busy) {
  if (!g_meta) return;
  if (g_player.running()) {
    g_player.tick(g_env);
    if (!g_player.running()) {
      g_lastError = g_player.error();
      Serial.printf("[APP] %s \"%s\"%s%s\n", g_lastError.length() ? "stopped" : "done", g_player.name(), g_lastError.length() ? ": " : "", g_lastError.c_str());
      if (g_lastError.length()) g_lastError = String(g_player.name()) + ": " + g_lastError;
      if (g_run) g_run->clear();
    }
    return;
  }
  if (g_pending.index >= 0) {
    const uint32_t waited = millis() - g_pending.since;
    const bool voice = g_pending.origin == "röst", says = g_pending.origin == "sa";
    if (!busy) {
      if (!g_pending.idleSince) g_pending.idleSince = millis() ? millis() : 1;
      if (millis() - g_pending.idleSince >= kSettleMs) beginRun(g_pending.index);
      return;
    }
    g_pending.idleSince = 0;
    if ((says || (voice && waited > 20000)) && !g_pending.stopSent) { gemini.stopConversation(); g_pending.stopSent = true; Serial.println("[APP] ending conversation to start the app"); }
    const uint32_t limit = voice || says ? 35000 : g_pending.origin == "klockslag" ? 60000 : 8000;
    if (waited > limit) { g_lastError = String(g_meta[g_pending.index].name) + ": roboten var upptagen"; Serial.printf("[APP] %s\n", g_lastError.c_str()); g_pending = Pending{}; }
    return;
  }
  pollTriggers(busy);
}

String startIndex(int index, const char* origin) {
  if (!g_meta) return "Appar stöds inte";
  if (index < 0 || index >= g_count) return "Okänd app";
  if (g_player.running()) return String(g_player.name()) + " körs redan";
  if (g_pending.index >= 0) return "En app väntar redan på att starta";
  queue(index, origin, false);
  return "";
}
void stop() {
  if (g_pending.index >= 0) { Serial.println("[APP] pending start cancelled"); g_pending = Pending{}; }
  if (g_player.running()) { g_player.stop(); g_lastError = ""; Serial.printf("[APP] stopped \"%s\"\n", g_player.name()); if (g_run) g_run->clear(); }
}
void resetLook() {
  emotion.setLedOverride("auto", 0, 0, 0);
  ScreenImage::clear();
  emotion.setEmotion("neutral");
  servoGestures.queueGesture("center_head");
  emotion.forceRedraw();
}
bool running() { return g_player.running() || g_pending.index >= 0; }
int count() { return g_count; }
String name(int index) { return index >= 0 && index < g_count ? String(g_meta[index].name) : String(); }
String statusLine() {
  if (g_player.running()) return String("Kör ") + g_player.name();
  if (g_pending.index >= 0) return String("Startar ") + g_meta[g_pending.index].name;
  return g_lastError;
}

void onUserWords(const char* fragment) {
  if (!g_meta || !fragment || DiagnosticMode::active()) return;
  const char* u = g_joiner.push(fragment, millis());
  for (int a = 0; a < g_count; ++a) {
    if (!g_meta[a].enabled || g_firedUtt[a] == g_joiner.id) continue;
    for (int i = 0; i < g_meta[a].triggerCount; ++i) {
      if (g_meta[a].t[i].kind == Trig::Says && saysMatch(g_meta[a].t[i].phrase, u)) { g_firedUtt[a] = g_joiner.id; queue(a, "sa", true); return; }
    }
  }
}
bool onHeadTouch() {
  Serial.println("[APP] head touch");
  if (!g_meta || g_player.running() || g_pending.index >= 0) return false;
  for (int a = 0; a < g_count; ++a) {
    if (!g_meta[a].enabled) continue;
    for (int i = 0; i < g_meta[a].triggerCount; ++i) if (g_meta[a].t[i].kind == Trig::HeadTouch) { queue(a, "huvudet", true); return true; }
  }
  return false;
}

String importSd() {
  if (!g_meta) return "Appar stöds inte";
  if (g_player.running()) return "Stoppa appen först";
  bool mounted = false;
  if (!g_sdBoot) {
    if (!SD.begin(GPIO_NUM_4, SPI, 25000000)) return "Inget SD-kort hittades";
    mounted = true;
  }
  int ok = 0, bad = 0;
  String firstError;
  File dir = SD.open(kSdDir);
  if (!dir || !dir.isDirectory()) { if (mounted) SD.end(); return "Mappen stackchan-apps saknas"; }
  char ids[kMaxApps][kIdMax + 1]; int n = 0;
  for (File f = dir.openNextFile(); f && n < kMaxApps; f = dir.openNextFile()) {
    char id[kIdMax + 1];
    if (!f.isDirectory() && parseFileName(baseName(f.name()), id, sizeof id) == FileKind::Json) std::snprintf(ids[n++], sizeof ids[0], "%s", id);
    f.close();
  }
  dir.close();
  g_fs->mkdir(kDir); g_fs->mkdir(kTmp);
  for (int i = 0; i < n; ++i) {
    const String json = String(ids[i]) + ".json";
    bool copied = copyFile(SD, path(kSdDir, json.c_str()), path(kTmp, json.c_str()), kMaxJsonBytes);
    char f[kIdMax + 16];
    for (int s = 0; copied && s < kMaxSteps; ++s) {
      imageFile(ids[i], s, f, sizeof f);
      if (SD.exists(path(kSdDir, f))) copied = copyFile(SD, path(kSdDir, f), path(kTmp, f), kMaxImageBytes);
    }
    const char* err = copied ? install(ids[i]) : "copy_failed";
    if (err) { ++bad; if (!firstError.length()) firstError = err; removeApp(*g_fs, kTmp, ids[i]); } else ++ok;
  }
  if (mounted) SD.end();
  Serial.printf("[APP] SD import ok=%d failed=%d %s\n", ok, bad, firstError.c_str());
  String msg = "Inlästa: " + String(ok);
  if (bad) msg += ", fel: " + String(bad) + " (" + firstError + ")";
  return msg;
}

void status(JsonDocument& out) {
  out["ok"] = true; out["supported"] = g_meta != nullptr; out["version"] = 1;
  out["max_apps"] = kMaxApps; out["max_images"] = kMaxImages; out["max_json_bytes"] = kMaxJsonBytes;
  out["max_image_bytes"] = kMaxImageBytes; out["chunk_base64_max"] = kChunkBase64Max;
  out["bytes_used"] = g_bytes; out["bytes_max"] = kMaxTotalBytes; out["sd_storage"] = g_sdBoot;
  if (g_player.running()) { out["running"]["name"] = g_player.name(); out["running"]["step"] = g_player.step() + 1; }
  if (g_pending.index >= 0) out["pending"] = g_meta[g_pending.index].name;
  out["last_error"] = g_lastError;
  auto apps = out["apps"].to<JsonArray>();
  for (int i = 0; i < g_count; ++i) {
    const AppMeta& m = g_meta[i];
    auto a = apps.add<JsonObject>();
    a["id"] = m.id; a["name"] = m.name; a["enabled"] = m.enabled; a["cooldown_s"] = m.cooldown; a["steps"] = m.steps; a["images"] = m.images;
    auto t = a["triggers"].to<JsonArray>();
    for (int k = 0; k < m.triggerCount; ++k) {
      static const char* const kinds[] = {"button", "time", "says", "near", "light", "head_touch"};
      t.add(kinds[static_cast<int>(m.t[k].kind)]);
    }
  }
}

int handle(JsonVariantConst in, JsonDocument& out) {
  if (!g_meta) return fail(out, 503, "robot_apps_unavailable");
  const char* action = in["action"] | "";
  if (!*action) { status(out); return 200; }
  if (!std::strcmp(action, "upload")) return upload(in, out);
  const char* id = in["id"] | "";
  if (!std::strcmp(action, "install")) { const char* e = install(id); if (e) { removeApp(*g_fs, kTmp, id); return fail(out, e == std::string("too_many_apps") || e == std::string("storage_limit") ? 507 : 400, e); } status(out); return 200; }
  if (!std::strcmp(action, "delete")) {
    const int i = indexOf(id);
    if (i < 0) return fail(out, 404, "unknown_app");
    if (g_player.running() && !std::strcmp(g_player.name(), g_meta[i].name)) stop();
    if (g_pending.index >= 0) g_pending = Pending{};
    removeApp(*g_fs, kDir, id); reindex(); status(out); return 200;
  }
  if (!std::strcmp(action, "enable")) {
    if (!in["enabled"].is<bool>()) return fail(out, 400, "enabled_must_be_boolean");
    const char* e = setEnabled(id, in["enabled"].as<bool>());
    if (e) return fail(out, 400, e);
    status(out); return 200;
  }
  if (!std::strcmp(action, "run")) {
    const String e = startIndex(indexOf(id), "Command Hub");
    if (e.length()) { out["ok"] = false; out["error"] = e; return 409; }
    status(out); return 202;
  }
  if (!std::strcmp(action, "stop")) { stop(); status(out); return 200; }
  if (!std::strcmp(action, "reset")) { stop(); resetLook(); status(out); return 200; }
  if (!std::strcmp(action, "import_sd")) { out["message"] = importSd(); status(out); return 200; }
  return fail(out, 400, "unknown_action");
}

bool toolDeclared() { return g_meta && g_count > 0; }
String toolDescription() {
  String d = "Start or stop one of the owner's own robot apps stored on this robot (sequences of lights, faces, gestures, screen and speech). "
             "Use when the user asks to start/run/open an app by name ('starta appen Disco', 'kör godnatt') or to stop the running app. "
             "The app starts when this conversation ends: confirm in one short sentence and also call end_session in the same turn. Known apps: ";
  for (int i = 0; i < g_count; ++i) { if (i) d += ", "; d += g_meta[i].name; }
  return d + ".";
}
int toolCall(JsonVariantConst args, JsonDocument& out) {
  const char* action = args["action"] | "start";
  if (!std::strcmp(action, "stop")) { stop(); out["ok"] = true; out["stopped"] = true; return 200; }
  const int i = findByName(g_meta, g_count, args["name"] | "");
  if (i < 0) {
    out["ok"] = false; out["error"] = "unknown_app";
    auto names = out["known_apps"].to<JsonArray>();
    for (int k = 0; k < g_count; ++k) names.add(g_meta[k].name);
    return 404;
  }
  const String e = startIndex(i, "röst");
  if (e.length()) { out["ok"] = false; out["error"] = e; return 409; }
  out["ok"] = true; out["app"] = g_meta[i].name;
  out["note"] = "The app starts when the conversation ends. Confirm briefly and call end_session now.";
  return 200;
}
}  // namespace RobotApps
