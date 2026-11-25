#include "PerfMonitor.h"
#include "FirmwareVersion.h"
#include <WiFi.h>
#include <esp_heap_caps.h>
#include <esp_freertos_hooks.h>
#include <freertos/task.h>
#include "BleBridge.h"
namespace PerfMonitor {
static PerfPolicy::Metric metrics[StageCount];
static volatile uint32_t ticks[2] = {}, idle[2] = {};
static uint32_t previousTicks[2] = {}, previousIdle[2] = {};
static TaskHandle_t idleTask[2] = {};
static bool registered[2] = {};
static uint32_t lastReport = 0, lastLoop = 0, gapMax = 0, skipped = 0;
// ISR hooks only count samples; no allocation, I/O, timers or scheduler changes.
static void IRAM_ATTR tick0() { ++ticks[0]; if (xTaskGetCurrentTaskHandleForCPU(0) == idleTask[0]) ++idle[0]; }
static void IRAM_ATTR tick1() { ++ticks[1]; if (xTaskGetCurrentTaskHandleForCPU(1) == idleTask[1]) ++idle[1]; }
void begin() {
  idleTask[0] = xTaskGetIdleTaskHandleForCPU(0);
  idleTask[1] = xTaskGetIdleTaskHandleForCPU(1);
  registered[0] = esp_register_freertos_tick_hook_for_cpu(tick0, 0) == ESP_OK;
  registered[1] = esp_register_freertos_tick_hook_for_cpu(tick1, 1) == ESP_OK;
  lastReport = millis();
}
void record(Stage stage, uint32_t us) { metrics[stage].add(us); }
void loopStart() {
  uint32_t now = micros();
  if (lastLoop && now - lastLoop > gapMax) gapMax = now - lastLoop;
  lastLoop = now;
}
static bool g_enabled = false;
void setEnabled(bool on) { g_enabled = on; }
bool enabled() { return g_enabled; }
void report(uint32_t queueMs, uint32_t underruns, uint32_t dropped,
            uint32_t waitMs, uint32_t speakerSlots, const char* mode) {
  uint32_t now = millis(), window = now - lastReport;
  if (window < PerfPolicy::intervalMs) return;
  if (!g_enabled) { lastReport = now; return; }
  int cpu[2]; uint32_t samples[2];
  for (int c = 0; c < 2; ++c) {
    uint32_t t = ticks[c], i = idle[c];
    samples[c] = t - previousTicks[c];
    cpu[c] = registered[c] ? PerfPolicy::sampledBusy(i - previousIdle[c], samples[c]) : -1;
    previousTicks[c] = t; previousIdle[c] = i;
  }
  char line[600];
  int n = snprintf(line, sizeof line,
    "[PERF] {\"v\":1,\"fw\":\"%s\",\"ms\":%lu,\"window_ms\":%lu,\"cpu0\":%d,\"cpu1\":%d,\"ticks0\":%lu,\"ticks1\":%lu,\"loop_us\":%lu,\"gap_us\":%lu,\"ws_us\":%lu,\"audio_us\":%lu,\"mic_us\":%lu,\"lcd_us\":%lu,\"services_us\":%lu,\"loops\":%lu,\"frames\":%lu,\"queue_ms\":%lu,\"slots\":%lu,\"underruns\":%lu,\"dropped\":%lu,\"wait_ms\":%lu,\"heap\":%u,\"largest\":%u,\"psram\":%u,\"stack\":%u,\"rssi\":%d,\"ble\":%d,\"mode\":\"%s\",\"skipped\":%lu}\n",
    kFirmwareVersion, (unsigned long)now, (unsigned long)window, cpu[0], cpu[1], (unsigned long)samples[0], (unsigned long)samples[1],
    (unsigned long)metrics[Loop].maximum, (unsigned long)gapMax, (unsigned long)metrics[WebSocket].maximum,
    (unsigned long)metrics[Audio].maximum, (unsigned long)metrics[Mic].maximum, (unsigned long)metrics[Lcd].maximum,
    (unsigned long)metrics[Services].maximum, (unsigned long)metrics[Loop].count, (unsigned long)metrics[Lcd].count,
    (unsigned long)queueMs, (unsigned long)speakerSlots, (unsigned long)underruns, (unsigned long)dropped, (unsigned long)waitMs,
    (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT),
    (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT),
    (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM), (unsigned)uxTaskGetStackHighWaterMark(nullptr),
    WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0, BleBridge::enabled() ? 1 : 0, mode, (unsigned long)skipped);
  // Never block playback waiting for serial buffer space. A lost sample is counted.
  if (n > 0 && n < static_cast<int>(sizeof line) && Serial.availableForWrite() >= n) Serial.write((const uint8_t*)line, n);
  else ++skipped;
  for (auto& m : metrics) m = {};
  gapMax = 0; lastReport = now;
}
}