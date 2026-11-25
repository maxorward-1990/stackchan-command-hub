#pragma once
#include <Arduino.h>

class CameraCapture {
 public:
  bool begin();
  bool enabled() const;
  bool ready() const;
  const String& lastError() const { return last_error_; }
  size_t lastJpegBytes() const { return last_jpeg_bytes_; }
  size_t lastBase64Bytes() const { return last_base64_bytes_; }
  bool captureJpegBase64(String& out);
  bool captureJpegBytes(uint8_t** out, size_t* len);
  // Live stream (surveillance view): keeps the sensor powered between frames.
  // While streaming, one-shot captures are refused instead of fighting over the driver.
  bool streamBegin();
  bool streamFrame(uint8_t** out, size_t* len, int quality);  // caller frees *out
  void streamEnd();
  bool streaming() const { return streaming_; }

 private:
  bool initHardware_();
  void deinitHardware_();
  bool captureJpegInternal_(uint8_t** out, size_t* len);
  bool begun_ = false;
  bool ready_ = false;
  bool hardware_active_ = false;
  volatile bool streaming_ = false;
  String last_error_ = "not_started";
  size_t last_jpeg_bytes_ = 0;
  size_t last_base64_bytes_ = 0;
};
