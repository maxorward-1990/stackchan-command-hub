#include "CameraCapture.h"

#if defined(ENABLE_CAMERA)
#include <M5Unified.h>
#include <esp_camera.h>
#include <esp_heap_caps.h>
#include "AudioDiagnostics.h"
static bool s_micClockBorrowed = false;  // v79: mic started only to clock the camera
#include <img_converters.h>
#include <cstring>
#include <cstdlib>
#include <mbedtls/base64.h>

static camera_config_t kCameraConfig = {
    .pin_pwdn = -1,
    .pin_reset = -1,
    // Stock/native StackChan uses an external 20MHz camera clock and sets
    // CAMERA_PIN_XCLK to GPIO_NUM_NC. Do not generate XCLK via LEDC here;
    // the previous GPIO/LEDC XCLK smoke build made speech choppy.
    .pin_xclk = -1,
    .pin_sscb_sda = 12,
    .pin_sscb_scl = 11,
    .pin_d7 = 47,
    .pin_d6 = 48,
    .pin_d5 = 16,
    .pin_d4 = 15,
    .pin_d3 = 42,
    .pin_d2 = 41,
    .pin_d1 = 40,
    .pin_d0 = 39,
    .pin_vsync = 46,
    .pin_href = 38,
    .pin_pclk = 45,
    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,
    .pixel_format = PIXFORMAT_RGB565,
    .frame_size = FRAMESIZE_QVGA,
    .jpeg_quality = 12,
    .fb_count = 1,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_LATEST,
};
#endif

bool CameraCapture::initHardware_() {
#if defined(ENABLE_CAMERA)
  if (hardware_active_) return true;
  // Stock firmware uses esp_video/V4L2 and opens the video device from the
  // board camera object. This Arduino probe keeps esp_camera lifetime short:
  // init only for smoke capture, then deinit, so voice/audio is not forced to
  // coexist with an always-on camera driver.
  // v79: the camera clock comes from the codec MCLK (GPIO0), which only runs while the mic is active.
  s_micClockBorrowed = false;
  if (!M5.Mic.isRunning() && !M5.Speaker.isPlaying() && !AudioDiagnostics::busy()) {
    if (M5.Speaker.isRunning()) M5.Speaker.end();
    s_micClockBorrowed = M5.Mic.begin();
  }
  Serial.printf("[CAMERA] clock mic_running=%d borrowed=%d\n", M5.Mic.isRunning(), s_micClockBorrowed);
  M5.In_I2C.release();
  esp_camera_set_psram_mode(true);  // v78: DMA into the PSRAM frame buffer, no 30 KiB internal block
  Serial.printf("[CAMERA] init psram_dma=%d internal_largest=%u dma_largest=%u psram_free=%u\n", esp_camera_get_psram_mode(),
                (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT),
                (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_DMA), (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
  esp_err_t err = esp_camera_init(&kCameraConfig);
  if (err != ESP_OK) {
    ready_ = false;
    hardware_active_ = false;
    last_error_ = String("esp_camera_init_failed:") + String(static_cast<int>(err));
    Serial.printf("Camera: init failed err=%d\n", static_cast<int>(err));
    M5.In_I2C.begin();  // v79: init failure left the internal I2C bus released (LEDs, codec)
    if (s_micClockBorrowed) { M5.Mic.end(); s_micClockBorrowed = false; }
    return false;
  }
  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_hmirror(sensor, 0);
    sensor->set_vflip(sensor, 0);
  }
  ready_ = true;
  hardware_active_ = true;
  last_error_ = "";
  Serial.println("Camera: hardware active");
  return true;
#else
  return false;
#endif
}

void CameraCapture::deinitHardware_() {
#if defined(ENABLE_CAMERA)
  if (hardware_active_) {
    esp_camera_deinit();
    hardware_active_ = false;
    ready_ = false;
    // Camera init temporarily releases the internal I2C bus. StackChan RGB LEDs
    // are also driven through that bus, so restore it immediately after capture;
    // otherwise later emotion changes (thinking/speaking/sleep) can update state
    // logically while the physical camera-assist white LEDs remain latched.
    bool i2cRestored = M5.In_I2C.begin();
    Serial.printf("Camera: hardware deinit; In_I2C restore=%s\n", i2cRestored ? "ok" : "failed");
    if (s_micClockBorrowed) { M5.Mic.end(); s_micClockBorrowed = false; Serial.println("[CAMERA] mic clock returned"); }
  }
#endif
}

bool CameraCapture::begin() {
  begun_ = true;
#if defined(ENABLE_CAMERA)
  ready_ = false;
  hardware_active_ = false;
  last_error_ = "camera_enabled_lazy_init";
  Serial.println("Camera: enabled at build, lazy init for smoke capture only");
  return true;
#else
  ready_ = false;
  hardware_active_ = false;
  last_error_ = "camera_disabled_at_build";
  Serial.println("Camera: disabled at build");
  return false;
#endif
}

bool CameraCapture::enabled() const {
#if defined(ENABLE_CAMERA)
  return true;
#else
  return false;
#endif
}

bool CameraCapture::ready() const { return ready_; }

bool CameraCapture::captureJpegInternal_(uint8_t** out, size_t* len) {
  if (out) *out = nullptr;
  if (len) *len = 0;
#if defined(ENABLE_CAMERA)
  if (!out || !len) return false;
  if (streaming_) { last_error_ = "camera_busy_streaming"; return false; }
  if (!initHardware_()) return false;

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.printf("[CAMERA] no frame mic_running=%d borrowed=%d\n", M5.Mic.isRunning(), s_micClockBorrowed);
    deinitHardware_();
    return false;
  }

  // CoreS3 camera frames are physically mirrored for user-facing left/right
  // reasoning on this robot. Correct RGB565 frames before JPEG/base64 so every
  // consumer (/api/camera/jpeg, latest.jpg, and Gemini image turns) sees the
  // same real-world orientation. Keep this in software: sensor hmirror behaved
  // inconsistently in earlier firmware experiments.
  if (fb->format == PIXFORMAT_RGB565 && fb->width > 1 && fb->height > 0) {
    uint16_t* pixels = reinterpret_cast<uint16_t*>(fb->buf);
    const int width = fb->width;
    const int height = fb->height;
    for (int y = 0; y < height; ++y) {
      uint16_t* row = pixels + y * width;
      for (int x = 0; x < width / 2; ++x) {
        uint16_t tmp = row[x];
        row[x] = row[width - 1 - x];
        row[width - 1 - x] = tmp;
      }
    }
  }

  uint8_t* jpg_buf = nullptr;
  size_t jpg_len = 0;
  bool direct_jpeg = (fb->format == PIXFORMAT_JPEG);
  bool converted = false;
  if (direct_jpeg) {
    jpg_buf = fb->buf;
    jpg_len = fb->len;
    converted = true;
  } else {
    converted = frame2jpg(fb, 80, &jpg_buf, &jpg_len);
  }
  if (!converted || !jpg_buf || !jpg_len) {
    esp_camera_fb_return(fb);
    deinitHardware_();
    return false;
  }

  uint8_t* copy = static_cast<uint8_t*>(malloc(jpg_len));
  if (!copy) {
    esp_camera_fb_return(fb);
    if (!direct_jpeg && jpg_buf) free(jpg_buf);
    deinitHardware_();
    return false;
  }
  memcpy(copy, jpg_buf, jpg_len);
  esp_camera_fb_return(fb);
  if (!direct_jpeg && jpg_buf) free(jpg_buf);
  deinitHardware_();
  *out = copy;
  *len = jpg_len;
  return true;
#else
  return false;
#endif
}

bool CameraCapture::captureJpegBase64(String& out) {
  out = "";
  last_jpeg_bytes_ = 0;
  last_base64_bytes_ = 0;
#if defined(ENABLE_CAMERA)
  if (!begun_) {
    last_error_ = "camera_not_started";
    return false;
  }
  uint8_t* jpg = nullptr;
  size_t jpg_len = 0;
  if (!captureJpegInternal_(&jpg, &jpg_len)) {
    last_error_ = "camera_capture_or_jpeg_failed";
    return false;
  }
  size_t out_len = ((jpg_len + 2) / 3) * 4 + 1;
  char* b64 = static_cast<char*>(ps_malloc(out_len));
  if (!b64) b64 = static_cast<char*>(malloc(out_len));
  if (!b64) {
    free(jpg);
    last_error_ = "camera_base64_alloc_failed";
    return false;
  }
  size_t olen = 0;
  int rc = mbedtls_base64_encode(reinterpret_cast<unsigned char*>(b64), out_len, &olen, jpg, jpg_len);
  free(jpg);
  if (rc != 0) {
    free(b64);
    last_error_ = "camera_base64_encode_failed";
    return false;
  }
  b64[olen] = '\0';
  out = String(b64);
  free(b64);
  last_jpeg_bytes_ = jpg_len;
  last_base64_bytes_ = out.length();
  last_error_ = "";
  Serial.printf("Camera: captured jpeg=%u base64=%u\n", static_cast<unsigned>(last_jpeg_bytes_), static_cast<unsigned>(last_base64_bytes_));
  return true;
#else
  last_error_ = "camera_disabled_at_build";
  return false;
#endif
}

bool CameraCapture::captureJpegBytes(uint8_t** out, size_t* len) {
  if (out) *out = nullptr;
  if (len) *len = 0;
  last_jpeg_bytes_ = 0;
  last_base64_bytes_ = 0;
#if defined(ENABLE_CAMERA)
  if (!begun_) {
    last_error_ = "camera_not_started";
    return false;
  }
  if (!captureJpegInternal_(out, len)) {
    last_error_ = "camera_capture_or_jpeg_failed";
    return false;
  }
  last_jpeg_bytes_ = *len;
  last_base64_bytes_ = 0;
  last_error_ = "";
  Serial.printf("Camera: captured jpeg=%u direct_response\n", static_cast<unsigned>(last_jpeg_bytes_));
  return true;
#else
  last_error_ = "camera_disabled_at_build";
  return false;
#endif
}

#if defined(ENABLE_CAMERA)
static void mirrorRgb565(camera_fb_t* fb);
#endif

bool CameraCapture::streamBegin() {
#if defined(ENABLE_CAMERA)
  if (streaming_) return false;
  if (!initHardware_()) return false;
  streaming_ = true;
  Serial.println("Camera: live stream started");
  return true;
#else
  return false;
#endif
}

bool CameraCapture::streamFrame(uint8_t** out, size_t* len, int quality) {
  *out = nullptr; *len = 0;
#if defined(ENABLE_CAMERA)
  if (!streaming_ || !hardware_active_) return false;
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { last_error_ = "stream_frame_failed"; return false; }
  mirrorRgb565(fb);
  bool ok;
  if (fb->format == PIXFORMAT_JPEG) {
    uint8_t* copy = static_cast<uint8_t*>(malloc(fb->len));
    ok = copy != nullptr;
    if (ok) { memcpy(copy, fb->buf, fb->len); *out = copy; *len = fb->len; }
  } else {
    ok = frame2jpg(fb, quality, out, len) && *out && *len;
  }
  esp_camera_fb_return(fb);
  if (ok) last_jpeg_bytes_ = *len;
  return ok;
#else
  return false;
#endif
}

void CameraCapture::streamEnd() {
#if defined(ENABLE_CAMERA)
  if (!streaming_) return;
  streaming_ = false;
  deinitHardware_();
  Serial.println("Camera: live stream stopped");
#endif
}

#if defined(ENABLE_CAMERA)
// Same real-world orientation as one-shot captures (see captureJpegInternal_).
static void mirrorRgb565(camera_fb_t* fb) {
  if (fb->format != PIXFORMAT_RGB565 || fb->width < 2) return;
  uint16_t* px = reinterpret_cast<uint16_t*>(fb->buf);
  for (int y = 0; y < (int)fb->height; ++y) {
    uint16_t* row = px + y * fb->width;
    for (int x = 0; x < (int)fb->width / 2; ++x) { uint16_t t = row[x]; row[x] = row[fb->width - 1 - x]; row[fb->width - 1 - x] = t; }
  }
}
#endif
