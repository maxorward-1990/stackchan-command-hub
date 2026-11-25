#pragma once
#include <Arduino.h>
#include "PerfPolicy.h"
namespace PerfMonitor {
enum Stage { Loop, WebSocket, Audio, Mic, Lcd, Services, StageCount };
void begin();
void setEnabled(bool on);  // telemetry output; off by default
bool enabled();
void record(Stage stage, uint32_t us);
void loopStart();
void report(uint32_t queueMs, uint32_t underruns, uint32_t dropped,
            uint32_t waitMs, uint32_t speakerSlots, const char* mode);
class Scope {
 public:
  explicit Scope(Stage stage) : stage_(stage), start_(micros()) {}
  ~Scope() { record(stage_, static_cast<uint32_t>(micros() - start_)); }
 private:
  Stage stage_; uint32_t start_;
};
}