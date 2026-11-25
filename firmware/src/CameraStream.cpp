#include "CameraStream.h"
#include "CameraCapture.h"
#include "CameraStreamPolicy.h"
#include <esp_http_server.h>

namespace {
CameraCapture* g_cam = nullptr;
CameraStream::AuthCheck g_auth;
httpd_handle_t g_server = nullptr;
volatile bool g_active = false;
volatile bool g_voice_busy = false;
volatile bool g_stop = false;
volatile uint32_t g_frames = 0;
constexpr const char* kBoundary = "stackchanframe";

esp_err_t sendError(httpd_req_t* req, const char* status, const char* json) {
  httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_sendstr(req, json);
}

esp_err_t streamHandler(httpd_req_t* req) {
  using namespace CameraStreamPolicy;
  char auth[200] = {0};
  if (httpd_req_get_hdr_value_str(req, "Authorization", auth, sizeof auth) != ESP_OK) auth[0] = 0;
  if (g_auth && !g_auth(String(auth))) {
    httpd_resp_set_hdr(req, "WWW-Authenticate", "Basic realm=\"StackChan\"");
    return sendError(req, "401 Unauthorized", "{\"ok\":false,\"error\":\"auth_required\"}");
  }
  if (!canStart(g_active, g_voice_busy)) return sendError(req, "409 Conflict", "{\"ok\":false,\"error\":\"camera_busy_or_voice_active\"}");
  g_active = true; g_stop = false;
  // Give the main loop time to stop the voice session and release audio.
  delay(300);
  if (!g_cam || !g_cam->streamBegin()) {
    g_active = false;
    return sendError(req, "503 Service Unavailable", "{\"ok\":false,\"error\":\"camera_init_failed\"}");
  }
  httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=stackchanframe");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  const uint32_t start = millis();
  uint32_t last = 0;
  uint8_t failures = 0;
  esp_err_t res = ESP_OK;
  char head[96];
  while (!shouldStop(millis() - start, failures, g_stop)) {
    uint32_t wait = waitBeforeNextFrame(millis() - last);
    if (wait) delay(wait);
    last = millis();
    uint8_t* jpg = nullptr; size_t len = 0;
    if (!g_cam->streamFrame(&jpg, &len, kJpegQuality)) { ++failures; delay(50); continue; }
    failures = 0;
    int n = snprintf(head, sizeof head, "\r\n--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", kBoundary, (unsigned)len);
    res = httpd_resp_send_chunk(req, head, n);
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, reinterpret_cast<const char*>(jpg), len);
    free(jpg);
    if (res != ESP_OK) break;  // viewer closed the page
    ++g_frames;
  }
  g_cam->streamEnd();
  g_active = false;
  Serial.printf("CameraStream: ended frames=%u secs=%u\n", (unsigned)g_frames, (unsigned)((millis() - start) / 1000));
  return res == ESP_OK ? httpd_resp_send_chunk(req, nullptr, 0) : res;
}
}  // namespace

namespace CameraStream {
bool begin(CameraCapture& camera, AuthCheck auth) {
  if (g_server) return true;
  g_cam = &camera; g_auth = auth;
  httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
  cfg.server_port = CameraStreamPolicy::kPort;
  cfg.ctrl_port = 32769;  // the main server uses the default control port
  cfg.max_open_sockets = 2;
  cfg.stack_size = 8192;
  cfg.lru_purge_enable = true;
  if (httpd_start(&g_server, &cfg) != ESP_OK) { g_server = nullptr; Serial.println("CameraStream: start failed"); return false; }
  httpd_uri_t uri = {};
  uri.uri = "/stream"; uri.method = HTTP_GET; uri.handler = streamHandler;
  httpd_register_uri_handler(g_server, &uri);
  Serial.printf("CameraStream: http://<robot-ip>:%u/stream\n", CameraStreamPolicy::kPort);
  return true;
}
bool active() { return g_active; }
void setVoiceBusy(bool busy) { g_voice_busy = busy; }
void requestStop() { g_stop = true; }
uint32_t framesSent() { return g_frames; }
}  // namespace CameraStream
