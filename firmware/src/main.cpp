#include "TlsAllocator.h"
#include <Arduino.h>
#include <M5Unified.h>
#include <M5StackChan.h>
#include <SD.h>
#include <LittleFS.h>
#include <esp_partition.h>
#include "ScreenImage.h"
#include "DeskApp.h"
#include "FocusApp.h"
#include "PomodoroPolicy.h"
#include "WebResearch.h"
#include "InternetVisual.h"
#include "SmartHome.h"
#include "SerialCommandPolicy.h"
#include "BleBridge.h"
#include "TouchMenu.h"
#include "TouchMenuPolicy.h"
#include "ToolTogglePolicy.h"
#include "AudioDiagnostics.h"
#include "FirmwareVersion.h"
#include "TalkTouchPolicy.h"
#include "Personality.h"
#include "WakeWord.h"
#include "WakeWordPolicy.h"
#include "IdleMemoryPolicy.h"
#include <esp_heap_caps.h>
#include "TodoStore.h"
#include "PerfMonitor.h"
#include "SensorMonitor.h"
#include "RobotApps.h"
static void serialHelp();
static void setupMenuAndBluetooth();
static String routeApi(bool post, const String& path, const String& body);
class SelectedStorage : public fs::FS {
 public: SelectedStorage() : fs::FS(SD) {}
 void select(fs::FS& fs) { fs::FS::operator=(fs); }
};
SelectedStorage storage;
#include <SPI.h>
#include <WiFi.h>
#include "GeminiLiveProbe.h"
#include "MemoryStore.h"
#include "ToolGatewayClient.h"
#include "GeminiToolBridge.h"
#include "WebConfigServer.h"
#include "ConfigManager.h"
#include "EmotionController.h"
#include "ServoGestureController.h"
#include "CameraCapture.h"
#include "CameraStream.h"

GeminiLiveProbe gemini;
MemoryStore memory(storage);
ToolGatewayClient toolGateway;
EmotionController emotion;
ServoGestureController servoGestures;
CameraCapture camera;
GeminiToolBridge toolBridge(toolGateway, emotion, servoGestures, camera);
WebConfigServer webConfig(storage, memory, toolGateway, emotion, servoGestures, gemini, camera);
ConfigManager configManager(storage);
volatile bool g_voice_toggle_requested = false;
static uint8_t g_speaker_volume = 200;
static constexpr uint32_t kPowerButtonLedOffHoldMs = 700;
static uint32_t g_last_human_activity_ms = 0;
static uint32_t g_power_button_pressed_ms = 0;
static bool g_power_button_leds_off = false;

static void applySpeakerVolume() {
  M5.Speaker.setVolume(g_speaker_volume);
  M5.Speaker.setAllChannelVolume(g_speaker_volume);
  gemini.setSpeakerVolume(g_speaker_volume);
}

static void playBootDroidWhistle() {
  static constexpr int kBootSoundSampleRate = 24000;
  static constexpr float kPi = 3.14159265358979f;
  static constexpr float kTwoPi = 2.0f * kPi;
  static int16_t bootSound[14000];  // greeting phrase is ~0.55s at 24 kHz.
  size_t pos = 0;

  auto appendSweep = [&](float f1, float f2, float dur, float amp = 0.50f) {
    int n = static_cast<int>(kBootSoundSampleRate * dur);
    float phase = 0.0f;
    for (int i = 0; i < n && pos < (sizeof(bootSound) / sizeof(bootSound[0])); ++i) {
      float t = static_cast<float>(i) / static_cast<float>(n);
      float f = f1 + (f2 - f1) * t;
      float env = sinf(t * kPi);  // bell envelope: removes clicks/harsh edges.
      float s = amp * env * sinf(phase);
      bootSound[pos++] = static_cast<int16_t>(32767.0f * s);
      phase += kTwoPi * f / static_cast<float>(kBootSoundSampleRate);
      if (phase > kTwoPi) phase -= kTwoPi;
    }
  };

  // User-provided "greeting" phrase, rendered as PCM instead of square-wave
  // tone(): smoother R2-D2-style whistle with exact sweep timings. Use the
  // original amplitudes from the reference because the first quiet cap was
  // physically inaudible on the CoreS3 speaker/amp.
  appendSweep(800.0f, 2400.0f, 0.15f, 0.50f);   // rising whistle
  appendSweep(1800.0f, 600.0f, 0.10f, 0.48f);   // quick fall
  appendSweep(1200.0f, 2800.0f, 0.12f, 0.50f);  // happy beep
  appendSweep(2400.0f, 1600.0f, 0.18f, 0.46f);  // soft resolution

  const uint8_t savedVolume = g_speaker_volume;
  const uint8_t effectVolume = savedVolume > 180 ? 96 : (savedVolume > 80 ? savedVolume / 2 : 48);
  M5.Speaker.begin();
  delay(30);
  M5.Speaker.setVolume(effectVolume);
  M5.Speaker.setAllChannelVolume(effectVolume);
  // Keep robot sound effects off Gemini's voice channel (1).  Vision replies
  // stream voice audio on channel 1; stopping that channel from an effect path
  // can leave a later camera/voice handoff looking like it speaks silently.
  static constexpr uint8_t kEffectChannel = 0;
  bool queued = M5.Speaker.playRaw(bootSound, pos, kBootSoundSampleRate, false, 1, kEffectChannel, false);
  Serial.printf("Boot droid whistle: samples=%u volume=%u channel=%u queued=%s\n",
                static_cast<unsigned>(pos), static_cast<unsigned>(effectVolume),
                static_cast<unsigned>(kEffectChannel), queued ? "yes" : "no");
  uint32_t start = millis();
  while (M5.Speaker.isPlaying(kEffectChannel) && millis() - start < 1200) {
    M5StackChan.update();
    delay(10);
  }
  M5.Speaker.stop(kEffectChannel);
  M5.Speaker.setVolume(savedVolume);
  M5.Speaker.setAllChannelVolume(savedVolume);
}

static void configureAudio(uint8_t micMagnification = 16, uint8_t micNoiseFilterLevel = 0) {
  auto mic = M5.Mic.config();
  mic.sample_rate = 16000;
  // CoreS3/M5Unified software input gain. Default is 16. Keep conservative:
  // too much gain also amplifies room noise/echo and can hurt Gemini VAD.
  if (micMagnification < 1) micMagnification = 1;
  if (micMagnification > 24) micMagnification = 24;
  if (micNoiseFilterLevel > 4) micNoiseFilterLevel = 4;
  mic.magnification = micMagnification;
  mic.noise_filter_level = micNoiseFilterLevel;
  M5.Mic.config(mic);

  auto spk = M5.Speaker.config();
  spk.sample_rate = 96000;
  spk.task_pinned_core = APP_CPU_NUM;
  spk.magnification = 16;
  M5.Speaker.config(spk);
}

static void drawStatus(const char* line) {
  // Keep the LCD owned by EmotionController's procedural face renderer.
  // Older builds wrote status text directly to the screen here, which briefly
  // replaced the face until the next face frame. Status now goes to serial/API.
  Serial.printf("Status: %s\n", line ? line : "");
}

static void blackoutExternalLightsForPowerOff() {
  if (!g_power_button_leds_off) {
    Serial.println("Power: button hold -> RGB off latch");
    g_power_button_leds_off = true;
  }
  // The StackChan RGB LEDs live on the BSP IO expander and can remain latched
  // even when the CoreS3 display/PMIC turns the screen off. Keep writing black
  // while the firmware still runs so EmotionController cannot relight them.
  M5StackChan.showRgbColor(0, 0, 0);
}

static bool connectWifiFromConfig(const ConfigManager& cfg) {
  const auto& c = cfg.config();
  if (!c.wifiEnabled) {
    Serial.println("WiFi: disabled");
    return false;
  }
  String password = cfg.readWifiPassword();
  if (!c.wifiSsid.length() || !password.length()) {
    Serial.println("WiFi: missing ssid or password");
    return false;
  }
  Serial.println("WiFi: starting station mode");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(BleBridge::enabled());
  // DHCP on some routers/boots can leave DNS unusable even though the ESP is
  // reachable on the LAN. Gemini Live connect then fails at hostByName() and
  // the robot drops into error before audio starts. Keep DHCP addressing, but
  // pin reliable resolvers for outbound Gemini/gateway connections.
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE,
              IPAddress(1, 1, 1, 1), IPAddress(8, 8, 8, 8));
  WiFi.begin(c.wifiSsid.c_str(), password.c_str());
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
    M5StackChan.update();
  }
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(),
                IPAddress(1, 1, 1, 1), IPAddress(8, 8, 8, 8));
    Serial.print("WiFi: connected ip=");
    Serial.print(WiFi.localIP());
    Serial.print(" dns=");
    Serial.println(WiFi.dnsIP());
    drawStatus(WiFi.localIP().toString().c_str());
    // Always start SNTP (it resyncs hourly); the RTC alone drifts past Tuya's tolerance.
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    return true;
  }
  Serial.println("WiFi: connect timeout");
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
  return false;
}

static bool shouldStartSetupAccessPoint(const ConfigManager& cfg, bool sdConfigExists) {
  const auto& c = cfg.config();
  if (!sdConfigExists) return true;
  if (c.wifiEnabled) return true;
  return false;
}

static String setupApSuffix() {
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%04X", static_cast<unsigned>(ESP.getEfuseMac() & 0xFFFF));
  return String(suffix);
}

static bool startSetupAccessPoint(const ConfigManager& cfg) {
  String suffix = setupApSuffix();
  String apName = cfg.config().robotId.length() ? cfg.config().robotId : "stackchan";
  apName += "-setup-";
  apName += suffix;
  apName.replace(" ", "-");
  String apPassword = "stackchan" + suffix;
  Serial.print("WiFi: starting setup access point ssid=");
  Serial.println(apName);
  Serial.println("WiFi: setup access point password not logged");
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(BleBridge::enabled());
  bool ok = WiFi.softAP(apName.c_str(), apPassword.c_str());
  if (!ok) {
    Serial.println("WiFi: setup access point failed");
    return false;
  }
  Serial.print("WiFi: setup access point ip=");
  Serial.println(WiFi.softAPIP());
  drawStatus(WiFi.softAPIP().toString().c_str());
  return true;
}

void setup() {
  Serial.setRxBufferSize(8192);  // USB "api" lines carry up to ~6 KB of JSON
  Serial.setTxBufferSize(2048);  // one PERF line fits without waiting on the UART
  Serial.begin(115200);
  // v57: before any Wi-Fi/TLS: large mbedTLS buffers in PSRAM, not fragmented internal RAM.
  TlsAllocator::install();
  M5StackChan.begin();
  configureAudio();
  M5.Speaker.begin();
  applySpeakerVolume();
  playBootDroidWhistle();
  emotion.begin();
  servoGestures.begin();
  camera.begin();
  M5StackChan.Motion.goHome();
  // Safe defaults before SD config is loaded. ConfigManager may override after SD mount.
  ToolGatewayClient::Config gatewayConfig;
  gatewayConfig.enabled = false;
  gatewayConfig.baseUrl = "";
  gatewayConfig.robotId = "stackchan";
  toolGateway.begin(gatewayConfig);
  gemini.setToolBridge(&toolBridge);
  WebResearch::setPrepare([]() {
    WakeWord::stop();
    // Main-loop only, before worker reservation: close/drain Live and release TLS.
    gemini.disconnect(true, "thinking");
    if (M5.Speaker.isRunning()) M5.Speaker.end();
    Serial.println("[SEARCH] phase=owners_released");
  });
  toolBridge.setGemini(&gemini);
  toolBridge.setMemoryStore(&memory);
  gemini.setEmotionController(&emotion);
  gemini.setMemoryStore(&memory);
  WebConfigServer::Config webConfigOptions;
  webConfigOptions.enabled = false;
  webConfigOptions.port = 80;
  webConfigOptions.robotId = "stackchan";
  webConfig.begin(webConfigOptions);
  drawStatus("BSP + config compile");

  // Compile-only: do not print or embed secrets. Tomorrow load key from SD/NVS.
  // Example SD mount path is preserved for compatibility investigation.
  bool sd_ok = SD.begin(GPIO_NUM_4, SPI, 25000000);
  Serial.printf("Firmware: %s\n", kFirmwareVersion);
  Serial.printf("SD status: %s\n", sd_ok ? "ok (extra space: photos, app import)" : "missing");
  // v87: settings, memory and apps always live in internal LittleFS; an SD card is only extra space.
  // (Before v87 a card at boot replaced all storage, so Wi-Fi and keys seemed lost.)
  bool storage_ok = false, sd_storage = false;
  {
    storage_ok = LittleFS.begin(false);
    if (!storage_ok) {
      // Format only an entirely erased partition, never a damaged existing filesystem.
      const esp_partition_t* part = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, nullptr);
      bool blank = part != nullptr;
      uint8_t block[256];
      for (size_t offset = 0; blank && offset < part->size; offset += sizeof(block)) {
        if (esp_partition_read(part, offset, block, sizeof(block)) != ESP_OK) { blank = false; break; }
        for (uint8_t b : block) if (b != 255) { blank = false; break; }
      }
      if (blank) storage_ok = LittleFS.begin(true);
    }
    if (storage_ok) storage.select(LittleFS);
    Serial.printf("Internal flash storage: %s\n", storage_ok ? "ok" : "failed (not erased)");
    if (!storage_ok && sd_ok) { storage.select(SD); storage_ok = sd_storage = true; Serial.println("Storage: internal flash unusable, falling back to SD"); }
  }
  if (storage_ok) {
    MemoryStore::Policy policy;
    policy.keepRawSessions = 3;
    policy.keepRawDays = 3;
    policy.maxEventFileBytes = sd_storage ? 256 * 1024 : 32 * 1024;
    policy.maxRetrievedChars = 3000;
    TodoStore::attach(storage);
    DeskApp::attachStore(
      [](const char* j) { File f = storage.open("/apps.json", "w"); if (!f) return false; const size_t n = std::strlen(j); const bool ok = f.write(reinterpret_cast<const uint8_t*>(j), n) == n; f.close(); return ok; },
      [](char* b, size_t cap) -> size_t { File f = storage.open("/apps.json", "r"); if (!f) return size_t(0); const size_t sz = f.size(); if (sz > cap) { f.close(); return cap + 1; } const size_t n = f.read(reinterpret_cast<uint8_t*>(b), sz); f.close(); return n; });
    FocusApp::attachStore(
      [](const char* j) { File f = storage.open("/focus.json", "w"); if (!f) return false; const size_t n = std::strlen(j); const bool ok = f.write(reinterpret_cast<const uint8_t*>(j), n) == n; f.close(); return ok; },
      [](char* b, size_t cap) -> size_t { File f = storage.open("/focus.json", "r"); if (!f) return size_t(0); const size_t sz = f.size(); if (sz > cap) { f.close(); return cap + 1; } const size_t n = f.read(reinterpret_cast<uint8_t*>(b), sz); f.close(); return n; });
    SmartHome::attachStorage(storage);
    RobotApps::begin(storage, sd_ok);  // v85: owner's apps in /rapps
    Personality::begin(storage);
    bool memory_ok = memory.begin(policy);
    Serial.printf("MemoryStore status: %s session=%s day=%s\n",
                  memory_ok ? "ok" : "failed",
                  memory.currentSessionId(),
                  memory.todayKey());
    if (memory_ok) {
      memory.compactIfNeeded();
    }
    bool cfg_ok = configManager.begin();
    JsonDocument searchConfig;
    File searchFile = storage.exists("/app/StackChan/config/runtime.json") ? storage.open("/app/StackChan/config/runtime.json", FILE_READ) : File();
    if (searchFile) { deserializeJson(searchConfig, searchFile); searchFile.close(); }
    WebResearch::configure(configManager.readTavilyApiKey());
    WebResearch::setEnabled(searchConfig["web_search_enabled"] | false);
    SmartHome::configure(configManager.readTuyaClientId(), configManager.readTuyaClientSecret());
    SmartHome::setEnabled(searchConfig["smart_home_enabled"] | false);
    Serial.printf("SmartHome: enabled=%d configured=%d (keys not logged)\n", SmartHome::enabled(), SmartHome::configured());
    { uint8_t m = 0; for (const auto& k : ToolToggle::keys) if (searchConfig[k.config] | k.defaultOn) m |= k.group; ToolToggle::mask() = m; }
    Serial.printf("Tools: mask=0x%02x wikipedia=%d images=%d gestures=%d\n", ToolToggle::mask(), ToolToggle::on(ToolToggle::Wikipedia), ToolToggle::on(ToolToggle::Images), ToolToggle::on(ToolToggle::Gestures));
    bool runtime_config_exists = storage.exists("/app/StackChan/config/runtime.json");
    Serial.printf("ConfigManager init: %s\n", cfg_ok ? "ok" : "failed");
    configManager.printRedactedStatus(Serial);
    g_speaker_volume = configManager.config().speakerVolume;
    configureAudio(configManager.config().micMagnification,
                   configManager.config().micNoiseFilterLevel);
    applySpeakerVolume();
    Serial.printf("Audio: speaker_volume=%u mic_magnification=%u mic_noise_filter=%u\n",
                  static_cast<unsigned>(g_speaker_volume),
                  static_cast<unsigned>(configManager.config().micMagnification),
                  static_cast<unsigned>(configManager.config().micNoiseFilterLevel));
    toolGateway.begin(configManager.gatewayConfig());
    bool wifi_ok = connectWifiFromConfig(configManager);
    bool setup_ap_ok = false;
    if (!wifi_ok && shouldStartSetupAccessPoint(configManager, runtime_config_exists)) {
      setup_ap_ok = startSetupAccessPoint(configManager);
    }
    if (wifi_ok || setup_ap_ok) {
      if (wifi_ok) {
        webConfig.begin(configManager.webConfig());
      } else {
        WebConfigServer::Config setupWeb;
        setupWeb.enabled = true;
        setupWeb.port = 80;
        setupWeb.robotId = configManager.config().robotId.c_str();
        webConfig.begin(setupWeb);
      }
      const auto& cfg = configManager.config();
      if (wifi_ok && cfg.geminiEnabled) {
        if (configManager.hasGeminiApiKey()) {
          Serial.println("Gemini: configured lazy");
          gemini.setModel(cfg.geminiModel);
          gemini.setVoiceName(cfg.geminiVoice);
          gemini.setSpeechLanguages(cfg.speechLanguages);
          gemini.setVadConfig(cfg.vadPrefixPaddingMs, cfg.vadSilenceDurationMs,
                              cfg.vadStartSensitivityHigh, cfg.vadEndSensitivityLow,
                              cfg.vadTurnIncludesAllInput);
          gemini.setSystemPrompt(cfg.systemPrompt);
          gemini.setPersonaPrompt(cfg.personaPrompt);
          bool gemini_ok = gemini.begin(configManager.readGeminiApiKey().c_str());
          Serial.printf("Gemini: %s\n", gemini_ok ? "ready for on-demand connect" : "failed");
        } else {
          Serial.println("Gemini: enabled but api key missing");
        }
      } else if (wifi_ok) {
        Serial.println("Gemini: disabled");
      } else {
        Serial.println("Gemini: skipped in setup access point mode");
      }
    } else {
      WebConfigServer::Config webOff;
      webOff.enabled = false;
      webOff.robotId = configManager.config().robotId.c_str();
      webConfig.begin(webOff);
      Serial.println("Gemini: skipped because WiFi is not connected");
    }
  }

  setupMenuAndBluetooth();
  PerfMonitor::begin();
  SensorMonitor::begin();
  WakeWord::begin();
  serialHelp();
  // Gemini API key is loaded by ConfigManager as a secret and must never be printed.
  g_last_human_activity_ms = millis();
}

// ---- USB serial debug console (type commands in a serial terminal) ----
static bool g_serial_search_pending = false;
static void serialHelp() {
  Serial.println("CMD: help | status | mic | search <fraga> | say <text> | listen | stop | api [#id] GET|POST /api/... [json]  ([TID]-rader = svarstider i ms)");
}
static void serialMicTest() {
  if (gemini.isReady() || gemini.isRecording() || gemini.isSpeaking()) {
    Serial.println("CMD mic: busy; say 'stop' first"); return;
  }
  static int16_t buf[1600];
  M5.Speaker.end();
  WakeWord::stop();  // v50: wake word must release the shared mic
  if (!M5.Mic.begin()) { Serial.println("CMD mic: start failed"); M5.Speaker.begin(); return; }
  Serial.println("CMD mic: prata nu (2 s)...");
  for (int n = 0; n < 20; ++n) {
    if (!M5.Mic.record(buf, 1600, 16000)) { Serial.println("CMD mic: record failed"); break; }
    uint32_t t = millis();
    while (M5.Mic.isRecording() && millis() - t < 500) delay(1);
    int peak = 0; int64_t sq = 0;
    for (int i = 0; i < 1600; ++i) { int v = buf[i] < 0 ? -buf[i] : buf[i]; if (v > peak) peak = v; sq += (int64_t)buf[i] * buf[i]; }
    Serial.printf("CMD mic: %02d peak=%d rms=%d\n", n, peak, (int)sqrt((double)(sq / 1600)));
  }
  while (M5.Mic.isRecording()) delay(5);
  delay(20); M5.Mic.end();
  M5.Speaker.begin(); M5.Speaker.setVolume(g_speaker_volume); M5.Speaker.setAllChannelVolume(g_speaker_volume);
  Serial.println("CMD mic: done (peak<50 = mikrofonen hor inget)");
}
static void serialStatus() {
  Serial.printf("CMD status: wifi=%s ip=%s rssi=%d battery=%d%% heap=%u psram=%u\n",
    WiFi.status() == WL_CONNECTED ? "connected" : "offline", WiFi.localIP().toString().c_str(),
    WiFi.RSSI(), M5.Power.getBatteryLevel(), (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getFreePsram());
  Serial.printf("CMD status: gemini ready=%d recording=%d speaking=%d tool_pending=%d mic_chunks=%u last_rms=%u last_peak=%u\n",
    gemini.isReady(), gemini.isRecording(), gemini.isSpeaking(), gemini.toolPending(),
    (unsigned)gemini.micChunksSent(), gemini.lastMicRms(), gemini.lastMicPeak());
  Serial.printf("CMD status: search enabled=%d busy=%d diag=%s\n", WebResearch::enabled(), WebResearch::busy(), WebResearch::diagnostics().c_str());
}
static void handleSerialCommand(const String& line) {
  using namespace SerialCommandPolicy;
  Command c = parse(std::string(line.c_str()));
  switch (c.verb) {
    case Verb::None: return;
    case Verb::Help: serialHelp(); return;
    case Verb::Status: serialStatus(); return;
    case Verb::Mic: serialMicTest(); return;
    case Verb::Search:
      if (gemini.toolPending()) { Serial.println("CMD search: voice search running"); return; }
      if (WebResearch::start(String(c.arg.c_str()))) { g_serial_search_pending = true; Serial.println("CMD search: started"); }
      else Serial.println("CMD search: not started (disabled in Runtime, busy or invalid)");
      return;
    case Verb::Say:
      g_last_human_activity_ms = millis();
      Serial.println(gemini.requestTextTurn(String(c.arg.c_str())) ? "CMD say: sent to Gemini" : "CMD say: rejected (Gemini not configured?)");
      return;
    case Verb::Listen:
      g_last_human_activity_ms = millis();
      WakeWord::stop();
      Serial.println(gemini.requestConversationStart() ? "CMD listen: starting mic" : "CMD listen: failed");
      return;
    case Verb::Stop:
      gemini.stopConversation(); Serial.println("CMD stop: conversation stopped"); return;
    case Verb::Perf:
      PerfMonitor::setEnabled(c.arg == "on");
      Serial.printf("CMD perf: %s\n", PerfMonitor::enabled() ? "on" : "off");
      return;
    case Verb::Api: {
      g_last_human_activity_ms = millis();
      String res = routeApi(c.method == "POST", String(c.path.c_str()), String(c.body.c_str()));
      // One line so Command Hub can match the reply: "API #id <status> <json>".
      Serial.printf("API #%s %s\n", c.id.c_str(), res.c_str());
      return;
    }
    default: Serial.println("CMD: unknown command"); serialHelp(); return;
  }
}
static void pollSerialConsole() {
  static String line; static bool overflow = false; if (!line.length()) line.reserve(256);
  while (Serial.available()) {
    char ch = static_cast<char>(Serial.read());
    if (ch == '\n' || ch == '\r') {
      if (overflow) Serial.println("CMD: line too long");
      else if (line.length()) handleSerialCommand(line);
      line = ""; overflow = false;
    } else if (line.length() < SerialCommandPolicy::maxLineBytes) line += ch;
    else overflow = true;
  }
  // Learn device names once, ~20 s after boot, so Gemini knows what it can switch.
  static bool homePrefetched = false;
  if (!homePrefetched && millis() > 20000 && WiFi.status() == WL_CONNECTED && SmartHome::available() &&
      !SmartHome::busy() && !WebResearch::busy() && !gemini.toolPending() && !gemini.continuousConversation() &&
      !gemini.isReady() && !gemini.isSpeaking() && !gemini.isRecording()) { // v48: never TLS alongside Live
    homePrefetched = SmartHome::startList(true);
  }
  if (g_serial_search_pending && !gemini.toolPending()) {
    String result;
    if (WebResearch::takeResult(result)) {
      g_serial_search_pending = false;
      Serial.printf("CMD search result: %s\n", result.substring(0, 1500).c_str());
    }
  }
}


// ---- Bluetooth + on-screen menu (v15) ----
static constexpr const char* kBleBootPath = "/app/StackChan/config/ble_at_boot.txt";
static bool bleAtBoot() {
  File f = storage.open(kBleBootPath, FILE_READ);
  if (!f) return false;
  bool on = f.read() == '1'; f.close(); return on;
}
static void setBleAtBoot(bool on) {
  File f = storage.open(kBleBootPath, FILE_WRITE);
  if (f) { f.print(on ? "1" : "0"); f.close(); }
  Serial.printf("BLE: start at boot=%d\n", on);
}
static String bleName() {
  String n = configManager.config().robotId.length() ? configManager.config().robotId : String("stackchan");
  char sfx[6]; snprintf(sfx, sizeof sfx, "-%04X", static_cast<unsigned>(ESP.getEfuseMac() & 0xFFFF));
  return n + sfx;
}
// ESP32-S3 shares one 2.4 GHz radio: the coexistence driver aborts if BLE starts
// while Wi-Fi modem sleep is off. Enable modem sleep before BLE, restore after.
static void setBle(bool on) {
  if (on) {
    if (WiFi.getMode() != WIFI_OFF) WiFi.setSleep(true);
    if (!BleBridge::begin(bleName()) && WiFi.getMode() != WIFI_OFF) WiFi.setSleep(false);
  } else {
    BleBridge::end();
    if (WiFi.getMode() != WIFI_OFF) WiFi.setSleep(false);
  }
}
// /api/ble is answered here (it owns the radio), everything else by WebConfigServer.
static String bleApi(bool post, const String& body) {
  if (post) {
    JsonDocument in; deserializeJson(in, body);
    if (!in["enabled"].isNull()) setBle(in["enabled"] | false);
    if (!in["at_boot"].isNull()) setBleAtBoot(in["at_boot"] | false);
  }
  JsonDocument out;
  out["ok"] = true; out["enabled"] = BleBridge::enabled(); out["connected"] = BleBridge::connected();
  out["at_boot"] = bleAtBoot(); out["name"] = bleName();
  String s; serializeJson(out, s); return "200 " + s;
}
static String routeApi(bool post, const String& path, const String& body) {
  if (path == "/api/ble") return bleApi(post, body);
  return webConfig.serialApi(post ? HTTP_POST : HTTP_GET, path, body);
}
static void setupMenuAndBluetooth() {
  TouchMenu::Hooks h;
  h.api = [](bool post, const char* path, const String& body) { return routeApi(post, String(path), body); };
  h.getVolume = []() { return g_speaker_volume; };
  h.setVolume = [](uint8_t v) { g_speaker_volume = v; applySpeakerVolume(); };
  h.onOpen = []() { RobotApps::stop(); DeskApp::stopFullscreen(); FocusApp::leaveFullscreen(); gemini.stopConversation(); servoGestures.queueGesture("center_head"); };
  h.onClose = []() { emotion.setEmotion("neutral"); emotion.forceRedraw(); g_last_human_activity_ms = millis(); };
  h.bleAtBoot = bleAtBoot;
  h.setBleAtBoot = setBleAtBoot;
  h.setBle = setBle;
  h.robotName = bleName();
  h.firmware = kFirmwareVersion;
  h.appLabel = []() { return String(DeskApp::savedPlace()); };
  h.appStart = [](bool full) {
    const char* e = DeskApp::startSaved(full, std::time(nullptr));
    if (!e) { FocusApp::stop(); ScreenImage::clear(); Serial.printf("Menu: app start %s\n", full ? "fullscreen" : "widget"); }
    return String(e ? e : "");
  };
  h.focusLabel = []() {
    if (!FocusApp::running()) return String(FocusApp::summary());
    JsonDocument s; FocusApp::status(s);
    const uint32_t sec = (s["remaining_ms"].as<uint32_t>() + 999) / 1000; char b[48];
    if (FocusApp::simple()) { std::snprintf(b, sizeof b, "%s %02u:%02u", FocusApp::paused() ? "Pausad" : s["phase"] == "done" ? "Klart" : "Timer", unsigned(sec / 60), unsigned(sec % 60)); return String(b); }
    std::snprintf(b, sizeof b, "%s %02u:%02u · pass %d/%d", FocusApp::paused() ? "Pausad" : s["phase"] == "break" ? "Paus" : s["phase"] == "done" ? "Klart" : "Fokus", unsigned(sec / 60), unsigned(sec % 60), s["round"].as<int>(), s["rounds"].as<int>());
    return String(b);
  };
  h.focusAdjust = [](int dir) { FocusApp::adjustFocus(dir); Serial.printf("Menu: focus adjust %s\n", FocusApp::summary()); };
  h.focusState = []() { return FocusApp::running() ? (FocusApp::paused() ? 2 : 1) : 0; };
  h.focusAction = [](int a) {
    if (a == 2) { FocusApp::togglePause(); return String(); }
    if (a == 3) { FocusApp::stop(); Serial.println("Menu: focus stop"); return String(); }
    const char* e = FocusApp::startSaved(a == 1);
    if (!e) { DeskApp::stop(); ScreenImage::clear(); Serial.printf("Menu: focus start %s\n", a == 1 ? "fullscreen" : "widget"); }
    return String(e ? e : "");
  };
  h.rappCount = []() { return RobotApps::count(); };
  h.rappName = [](int i) { return RobotApps::name(i); };
  h.rappStart = [](int i) { return RobotApps::startIndex(i, "meny"); };
  h.rappStop = []() { Serial.println("[APP] menu: Stopp"); RobotApps::stop(); };
  h.rappReset = []() { Serial.println("[APP] menu: Återställ"); RobotApps::stop(); RobotApps::resetLook(); };
  h.rappImportSd = []() { Serial.println("[APP] menu: SD-kort"); String r = RobotApps::importSd(); Serial.printf("[APP] SD: %s\n", r.c_str()); return r; };
  h.rappStatus = []() { return RobotApps::statusLine(); };
  TouchMenu::begin(h);
  if (bleAtBoot()) setBle(true);
}
// Phone (Web Bluetooth) speaks the same "api #id METHOD /api/... json" protocol as USB.
static void pollBluetooth() {
  String line;
  while (BleBridge::takeLine(line)) {
    SerialCommandPolicy::Command c = SerialCommandPolicy::parse(std::string(line.c_str()));
    if (c.verb != SerialCommandPolicy::Verb::Api) { BleBridge::sendLine("ERR only api commands over Bluetooth"); continue; }
    g_last_human_activity_ms = millis();
    String res = routeApi(c.method == "POST", String(c.path.c_str()), String(c.body.c_str()));
    BleBridge::sendLine(String("API #") + c.id.c_str() + " " + res);
  }
}

// Conversation, menu, camera, diagnostics or an internet worker own the robot: apps must not start now.
static bool robotBusy() {
  // v86: a warm idle session (connected, mic off, after a turn) does not own the robot; apps may start.
  return (gemini.isReady() && !gemini.warmIdle()) || gemini.isConnecting() || gemini.continuousConversation() || gemini.isRecording() || gemini.canInterrupt() || gemini.toolPending() || AudioDiagnostics::busy() || TouchMenu::active() || CameraStream::active() || WebResearch::busy() || InternetVisual::busy() || SmartHome::busy();
}
void loop() {
  PerfMonitor::loopStart();
  uint32_t loopStarted = micros();
  M5StackChan.update();

  uint32_t now = millis();
  if (M5.BtnPWR.isPressed()) {
    if (g_power_button_pressed_ms == 0) g_power_button_pressed_ms = now;
    if (now - g_power_button_pressed_ms >= kPowerButtonLedOffHoldMs) {
      blackoutExternalLightsForPowerOff();
    }
  } else {
    g_power_button_pressed_ms = 0;
  }
  if (g_power_button_leds_off) {
    blackoutExternalLightsForPowerOff();
    delay(50);
    return;
  }

  pollSerialConsole();
  pollBluetooth();
  gemini.loop();
  static bool audioWasBusy = false;
  if (audioWasBusy && !AudioDiagnostics::busy()) emotion.setEmotion("neutral");
  audioWasBusy = AudioDiagnostics::busy();
  const bool appWasFull = DeskApp::fullscreen() || FocusApp::fullscreen();
  DeskApp::update(gemini.isReady() || gemini.isConnecting() || gemini.continuousConversation() || gemini.isRecording() || gemini.canInterrupt() || gemini.toolPending() || AudioDiagnostics::busy() || TouchMenu::active() || CameraStream::active() || WebResearch::busy() || InternetVisual::busy() || SmartHome::busy());
  FocusApp::update(gemini.isReady() || gemini.isConnecting() || gemini.continuousConversation() || gemini.isRecording() || gemini.canInterrupt() || gemini.toolPending() || AudioDiagnostics::busy() || TouchMenu::active() || CameraStream::active() || WebResearch::busy() || InternetVisual::busy() || SmartHome::busy());
  if (appWasFull && !DeskApp::fullscreen() && !FocusApp::fullscreen()) { emotion.forceRedraw(); g_last_human_activity_ms = millis(); }
  RobotApps::loop(robotBusy());
  emotion.loop();
  { PerfMonitor::Scope timing(PerfMonitor::Services);
    servoGestures.loop();
    webConfig.loop();
    // v39: knock to wake, pick-up/tip-over reactions; own servo/speaker motion is ignored.
    using SensorPolicy::Motion;
    bool convActive = gemini.continuousConversation() || gemini.isRecording() || gemini.isSpeaking();
    Motion motion = SensorMonitor::loop(servoGestures.active() || M5.Speaker.isPlaying() || gemini.isSpeaking());
    if (!TouchMenu::active() && !CameraStream::active() && !AudioDiagnostics::busy()) {
      if (motion == Motion::Tap && !convActive && emotion.currentEmotion() == "sleep") {
        g_last_human_activity_ms = millis();
        emotion.setEmotion("neutral"); emotion.forceRedraw();
      } else if (motion == Motion::Lifted && !convActive) {
        g_last_human_activity_ms = millis();
        emotion.setEmotion("happy");
      } else if (motion == Motion::Tipped) {
        emotion.setEmotion("error");
      } else if (motion == Motion::Upright) {
        g_last_human_activity_ms = millis();
        emotion.setEmotion(SensorPolicy::recoveryEmotion(gemini.isRecording(), gemini.isSpeaking(), convActive)); emotion.forceRedraw();
      }
      if (motion != Motion::None && (!robotBusy() || RobotApps::running())) RobotApps::onMotion(SensorPolicy::motionName(motion));  // v87 triggers, v89 also during an app's speech
    }
  }
  // Live camera (surveillance) mode: a viewer on :81/stream pauses voice.
  static bool streamServerStarted = false;
  if (!streamServerStarted && WiFi.status() == WL_CONNECTED) {
    streamServerStarted = CameraStream::begin(camera, [](const String& a) { return webConfig.checkAuthHeader(a); });
  }
  CameraStream::setVoiceBusy(gemini.isSpeaking() || AudioDiagnostics::busy());
  static bool streamWasActive = false;
  bool streamActive = CameraStream::active();
  if (streamActive && !streamWasActive) {
    Serial.println("Status: live camera on -> voice paused");
    if (gemini.continuousConversation() || gemini.isRecording()) gemini.stopConversation();
    ScreenImage::clear();
    emotion.setEmotion("looking");
  } else if (!streamActive && streamWasActive) {
    Serial.println("Status: live camera off");
    emotion.setEmotion("neutral");
    emotion.forceRedraw();
    g_last_human_activity_ms = millis();
  }
  streamWasActive = streamActive;
  bool touched = M5StackChan.TouchSensor.wasPressed();
  if (touched && (!robotBusy() || RobotApps::running()) && RobotApps::onHeadTouch()) { touched = false; g_last_human_activity_ms = millis(); }  // v85: an app owns head touch (v89: also while it talks)
  if (g_voice_toggle_requested) {
    g_voice_toggle_requested = false;
    Serial.println("HTTP voice toggle requested");
    touched = true;
  }
#if defined(ARDUINO_M5STACK_CORES3)
  static bool last_screen_pressed = false;
  static uint32_t press_start_ms = 0;
  static bool press_consumed = false;  // long press opened menu, or touch belonged to the menu
  auto t = M5.Touch.getDetail();
  bool screen_pressed = (M5.Touch.getCount() > 0) || t.isPressed();
  if (TouchMenu::active()) {
    TouchMenu::loop(screen_pressed, t.x, t.y);
    press_consumed = true;
    touched = false;
  } else {
    using namespace TouchMenuPolicy;
    if (screen_pressed && !last_screen_pressed) { press_start_ms = now; press_consumed = false; }
    // v30: track when a conversation stops so a hold racing a timeout never opens the menu.
    static bool conv_was_active = false; static uint32_t conv_ended_ms = 0;
    bool conv_now = gemini.continuousConversation();
    if (conv_was_active && !conv_now) conv_ended_ms = now;
    conv_was_active = conv_now;
    // v46: with the hold-menu turned off, an idle tap starts on touch-down (no release wait).
    if (screen_pressed && !last_screen_pressed &&
        !(FocusApp::widgetVisible() && PomodoroPolicy::widgetTap(t.y)) &&
        PersonalityPolicy::startOnPress(Personality::get().touchMenu, conv_now || gemini.canInterrupt())) {
      Serial.printf("Display touch-down start x=%d y=%d\n", t.x, t.y);
      press_consumed = true;
      touched = true;
    }
    static int press_x0 = 0, press_y0 = 0, press_x1 = 0, press_y1 = 0;
    if (screen_pressed) {
      if (!last_screen_pressed) { press_x0 = t.x; press_y0 = t.y; }
      press_x1 = t.x; press_y1 = t.y;
    }
    uint32_t since_end = conv_ended_ms ? now - conv_ended_ms : 0xFFFFFFFFu;
    // v89: while a robot app runs, a hold stops it (and its speech); taps are ignored below.
    if (screen_pressed && !press_consumed && RobotApps::running() && now - press_start_ms >= TalkTouchPolicy::holdThresholdMs(true)) {
      press_consumed = true; touched = false;
      Serial.println("Display long press: stop robot app");
      RobotApps::stop(); gemini.stopConversation(); emotion.setEmotion("neutral");
    }
    // v58: a hold only matters during a conversation (ends it); idle holds do nothing.
    if (screen_pressed && !press_consumed && conv_now &&
        now - press_start_ms >= TalkTouchPolicy::holdThresholdMs(conv_now)) {
      press_consumed = true;
      touched = false;
      TalkTouchPolicy::Action hold = TalkTouchPolicy::onLongPress(conv_now, since_end);
      if (hold == TalkTouchPolicy::Action::EndConversation) {
        Serial.println("Display long press: end conversation");
        g_last_human_activity_ms = millis();
        gemini.stopConversation();
        emotion.setEmotion("neutral");  // v59: sleep only via the idle timer
        drawStatus("dialog off");
      } else {
        Serial.println("Display long press: ignored");
      }
    } else if (!screen_pressed && last_screen_pressed && !press_consumed) {
      bool idle = !conv_now && !gemini.canInterrupt();
      if (idle && isSwipeUp(press_x0, press_y0, press_x1, press_y1)) {
        if (PersonalityPolicy::holdOpensMenu(Personality::get().touchMenu)) {
          Serial.println("Display swipe up: open menu");
          TouchMenu::open();
        }
      } else if (idle && now - press_start_ms >= TalkTouchPolicy::holdThresholdMs(false)) {
        Serial.println("Display long press: ignored (idle, swipe up for menu)");
      } else if (idle && FocusApp::widgetVisible() && PomodoroPolicy::widgetTap(press_y0)) {
        FocusApp::stop(); emotion.forceRedraw(); Serial.println("Display tap: focus widget stop");
      } else if (RobotApps::running()) {
        Serial.println("Display tap: ignored (robot app running; hold to stop it)");
      } else {
        // Short tap = talk/interrupt.
        Serial.printf("Display tap x=%d y=%d\n", t.x, t.y);
        touched = true;
      }
    }
  }
  last_screen_pressed = screen_pressed;
#endif
  // v50: local wake word, only while idle and silent; a detection takes the display-tap path.
  bool woke = false;
  {
    static IdleMemoryPolicy::Guard memoryGuard;
    static uint32_t lastMemorySample = 0;
    const bool safeIdle = !touched && M5.Touch.getCount() == 0 && !gemini.continuousConversation() &&
        !gemini.isReady() && !gemini.isConnecting() && !gemini.canInterrupt() &&
        !gemini.isRecording() && !gemini.isSpeaking() && !M5.Speaker.isPlaying() &&
        !servoGestures.active() && !M5StackChan.Motion.isMoving() && !TouchMenu::active() && !CameraStream::active() &&
        !AudioDiagnostics::busy() && !WebResearch::busy() && !InternetVisual::busy() && !SmartHome::busy();
    const uint32_t guardNow = millis();
    if (!safeIdle) {
      memoryGuard.poll(guardNow, false, 0, 0); // reset persistence without heap scans
    } else if (uint32_t(guardNow - lastMemorySample) >= 1000) {
      lastMemorySample = guardNow;
      const size_t internalFree = heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
      const size_t internalLargest = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
      if (memoryGuard.poll(guardNow, true, internalFree, internalLargest)) {
        WakeWord::stop();
        Serial.printf("[MEMGUARD] wake_released before_free=%u before_largest=%u after_free=%u after_largest=%u restart=0\n",
            unsigned(internalFree), unsigned(internalLargest),
            unsigned(heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)),
            unsigned(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)));
      }
    }
    static bool wake_conv_was = false; static uint32_t wake_conv_end_ms = 0;
    bool busy = gemini.continuousConversation() || gemini.toolPending() || gemini.canInterrupt();
    if (wake_conv_was && !busy) wake_conv_end_ms = millis();
    wake_conv_was = busy;
    WakeWordPolicy::Inputs w;
    w.enabled = Personality::get().wakeWord; w.modelReady = WakeWord::available();
    w.recording = gemini.isRecording(); w.speaking = gemini.isSpeaking() || M5.Speaker.isPlaying();
    w.conversation = busy || gemini.isConnecting(); w.camera = CameraStream::active(); w.menu = TouchMenu::active();
    w.diagnostics = AudioDiagnostics::busy() || servoGestures.active() || M5StackChan.Motion.isMoving() || memoryGuard.pauseWake(guardNow);
    w.search = WebResearch::busy() || SmartHome::busy() || InternetVisual::busy();
    if (!WakeWord::listening() && heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA) < 8192) w.search = true;  // Start-only I2S DMA guard
    uint32_t nowW = millis();
    if (wake_conv_end_ms) w.sinceConversationEndMs = nowW - wake_conv_end_ms;
    if (WakeWord::lastFailureMs()) w.sinceFailureMs = nowW - WakeWord::lastFailureMs();
    bool may = WakeWordPolicy::mayListen(w) && !touched;
    if (WakeWord::loop(may)) {
      DeskApp::stopFullscreen(); FocusApp::leaveFullscreen();
      woke = true; touched = true;
      emotion.setEmotion("listening");
      Serial.println("[WAKE] starting conversation (same path as display tap)");
    }
  }
  if (TouchMenu::active()) touched = false;
  if (gemini.consumeInterruptTouch()) touched = false;
  if (AudioDiagnostics::busy()) touched = false;
  // While streaming, a tap on the robot ends the stream (physical privacy override).
  if (touched && CameraStream::active()) { CameraStream::requestStop(); touched = false; }
  if (touched) {
    DeskApp::stopFullscreen(); FocusApp::leaveFullscreen();
    g_last_human_activity_ms = millis();
    memory.appendEvent("user", woke ? "wake word" : "touch pressed", woke ? "wake" : "touch");
    ScreenImage::clear();
    using TalkTouchPolicy::Action;
    Action tap = TalkTouchPolicy::onTap(gemini.continuousConversation(), gemini.canInterrupt(), gemini.isRecording(),
                                        TalkTouchPolicy::heardSpeech(gemini.turnPeakRms()));
    if (tap == Action::EndConversation) {
      Serial.printf("[TUR] inget tal hort (peak_rms=%u) - avslutar\n", gemini.turnPeakRms());
      gemini.stopConversation();
      emotion.setEmotion("neutral");
      drawStatus("dialog off");
    } else if (tap == Action::Interrupt) {
      gemini.requestInterrupt();
    } else if (tap == Action::SendTurn) {
      // v29: second tap = "I'm done talking", answer now instead of waiting for silence.
      if (gemini.endUserTurn()) drawStatus("dialog: thinking...");
    } else if (tap == Action::Start) {
      WakeWord::stop();  // release the shared half-duplex mic before Gemini opens it
      bool queued = gemini.requestConversationStart();
      if (queued && Personality::get().nodOnStart) servoGestures.queueGesture("nod_yes");
      if (queued) {
        // GeminiLiveProbe owns the cue: completed local capture, not TLS readiness.
        drawStatus(gemini.isReady() ? "dialog: preparing mic..." : "Gemini connecting...");
      } else {
        emotion.setEmotion("error");
        drawStatus("Gemini not configured");
      }
    }
  }
  now = millis();
  if (!DeskApp::fullscreen() && !FocusApp::fullscreen() && !TouchMenu::active() && !CameraStream::active() && !gemini.isReady() && !gemini.isRecording() && !gemini.isSpeaking() &&
      emotion.currentEmotion() == "neutral" && g_last_human_activity_ms &&
      PersonalityPolicy::sleepDue(Personality::get().sleepAfterS, now - g_last_human_activity_ms)) {
    Serial.println("Status: boot idle -> sleep");
    emotion.setEmotion("sleep");
    servoGestures.queueGesture("center_head");
  }
  PerfMonitor::record(PerfMonitor::Loop, micros() - loopStarted);
  PerfMonitor::report(gemini.queuedAudioMs(), gemini.audioUnderruns(), gemini.audioChunksDropped(),
                      gemini.audioBackpressureWaitMs(), M5.Speaker.isPlaying(1),
                      gemini.isSpeaking() ? "speaking" : gemini.isRecording() ? "listening" :
                      gemini.toolPending() ? "tool" : gemini.continuousConversation() ? "waiting" : "idle");
  delay(10);
}
