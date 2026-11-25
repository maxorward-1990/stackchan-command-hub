#pragma once
// v77 runtime wrapper around DiagnosticModePolicy (main-loop only: HTTP/USB routes and
// transcript handling both run there). Logs transitions, never conversation content.
#include <Arduino.h>
#include "DiagnosticModePolicy.h"

namespace DiagnosticMode {
inline DiagnosticModePolicy::State& state() {
  static DiagnosticModePolicy::State s;
  return s;
}
inline bool active() { return DiagnosticModePolicy::active(state(), millis()); }
inline uint32_t remainingMs() { return DiagnosticModePolicy::remainingMs(state(), millis()); }
inline void set(bool on, long seconds) {
  if (on) {
    DiagnosticModePolicy::activate(state(), millis(), seconds);
    Serial.printf("[DIAG] diagnosläge på i %lu s; samtal sparas inte i minnet\n",
                  static_cast<unsigned long>(remainingMs() / 1000));
  } else {
    DiagnosticModePolicy::deactivate(state());
    Serial.println("[DIAG] diagnosläge av; samtal sparas som vanligt");
  }
}
}  // namespace DiagnosticMode
