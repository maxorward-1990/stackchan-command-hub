#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <FS.h>
#include <functional>
#include <vector>
#include "MemoryStore.h"
#include "ToolGatewayClient.h"
#include "EmotionController.h"
#include "ServoGestureController.h"
#include "GeminiLiveProbe.h"
#include "CameraCapture.h"

// Small on-device configuration/status UI for StackChan option-B firmware.
// It intentionally stores secrets without ever returning their values over HTTP.
class WebConfigServer {
 public:
  // Basic-auth check usable from other servers (camera stream on port 81).
  bool checkAuthHeader(const String& authorization);
  struct Config {
    bool enabled = false;
    uint16_t port = 80;
    const char* robotId = "stackchan";
  };

  WebConfigServer(fs::FS& fs, MemoryStore& memory, ToolGatewayClient& gateway,
                  EmotionController& emotion, ServoGestureController& servoGestures,
                  GeminiLiveProbe& gemini, CameraCapture& camera);

  bool begin(const Config& config);
  void loop();
  bool enabled() const { return enabled_; }
  // Runs one API route without HTTP (USB console). Returns "<status> <json>".
  String serialApi(HTTPMethod method, const String& path, const String& body);

 private:
  fs::FS& fs_;
  MemoryStore& memory_;
  ToolGatewayClient& gateway_;
  EmotionController& emotion_;
  ServoGestureController& servoGestures_;
  GeminiLiveProbe& gemini_;
  CameraCapture& camera_;
  WebServer server_;
  Config config_;
  bool enabled_ = false;

  void registerRoutes();
  struct Route { String path; HTTPMethod method; std::function<void()> fn; };
  std::vector<Route> routes_;
  bool routes_registered_ = false;
  bool serial_active_ = false;
  HTTPMethod serial_method_ = HTTP_GET;
  String serial_path_, serial_query_, serial_body_, serial_out_;
  int serial_code_ = 0;
  void on(const char* path, HTTPMethod method, std::function<void()> fn);
  void reply(int code, const char* type, const String& body);
  void reply(int code, const char* type, const char* body);
  void header(const char* name, const String& value);
  bool hasArgS(const char* name);
  String argS(const char* name);
  HTTPMethod methodS();
  void sendJson(int code, JsonDocument& doc);
  String readBody();
  String sha256Hex(const String& value);
  bool webPasswordIsSet();
  bool decodeBasicCredentials(String& user, String& password);
  bool isAuthorized();
  void sendAuthRequired();
  bool requireAuth();

  void handleIndex();
  void handleStatus();
  void handleRuntimeGet();
  void handleRuntimeSave();
  void handleSecurityGet();
  void handleSecuritySave();
  void handleConfigGet();
  void handleConfigSave();
  void handleSecretSave();
  void handlePromptsGet();
  void handlePromptsSave();
  void handleMemoryRecent();
  void handleMemoryDialogues();
  void handleMemorySummaries();
  void handleMemorySearch();
  void handleMemoryStats();
  void handleMemorySummaryConfigGet();
  void handleMemorySummaryConfigSave();
  void handleMemorySummarize();
  void handleMemoryVectorize();
  void handleGatewayTools();
  void handleVoiceToggle();
  void handleGeminiText();
  void handleGeminiLook();
  void handleCameraStatus();
  void handleCameraCapture();
  void handleCameraJpeg();
  void handleSensorsPage();
  void handleSensors();
  void handleEmotion();
  void handleServoStatus();
  void handleServoMove();
  void handleServoGesture();
  void handleNotFound();

  bool writeTextFile(const char* path, const String& value);
  String readTextFile(const char* path, size_t maxBytes = 4096);
  String readRuntimeString(const char* key, const char* fallback);
  String readSummaryModel();
  bool callGeminiSummarizer(const String& model, const String& activeContext, String& summaryJson, String& error);
  bool appendJsonLine(const char* path, JsonDocument& doc);
  bool fileExists(const char* path);
};
