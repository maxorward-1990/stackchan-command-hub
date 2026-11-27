"""Threshold-only patch for the immutable v61 wake/personality baseline."""
from pathlib import Path


def apply(edit):
    edit("WakeWordPolicy.h", [
        ("inline bool hasExternalMemory", "constexpr uint16_t kDefaultThresholdMilli = 490;\ninline bool validThresholdMilli(long value) { return value >= 450 && value <= 750; }\ninline bool hasExternalMemory"),
    ])
    edit("PersonalityPolicy.h", [
        ("#include <cstdint>", '#include <cstdint>\n#include "WakeWordPolicy.h"'),
        ('  Led led[StateCount];', '  uint16_t wakeThresholdMilli = WakeWordPolicy::kDefaultThresholdMilli;\n  Led led[StateCount];'),
    ])
    edit("Personality.cpp", [
        ('  JsonVariantConst leds = in["led"], eyes = in["eye"];', '''  if (!in["wake_threshold_milli"].isNull()) {
    if (!in["wake_threshold_milli"].is<long>() || !WakeWordPolicy::validThresholdMilli(in["wake_threshold_milli"].as<long>())) return "invalid_wake_threshold";
    s.wakeThresholdMilli = in["wake_threshold_milli"].as<long>();
  }
  JsonVariantConst leds = in["led"], eyes = in["eye"];'''),
        ('  o["wake_word"] = g.wakeWord;', '  o["wake_word"] = g.wakeWord;\n  o["wake_threshold_milli"] = g.wakeThresholdMilli;'),
    ])
    edit("WakeWord.cpp", [
        ('#include "WakeWordPolicy.h"', '#include "WakeWordPolicy.h"\n#include "Personality.h"\n#include <cmath>'),
        ('int chunk = 0;', 'int chunk = 0;\nuint16_t appliedThresholdMilli = 0;'),
        ('  if (wnData) {\n    chunk =', '''  if (wnData) {
    appliedThresholdMilli = Personality::get().wakeThresholdMilli;
    const float requested = appliedThresholdMilli / 1000.0f;
    // WakeNet quantizes thresholds: the real robot reads 0.486 for requested 0.490.
    // Allow at most 0.020 rounding error; 0.000001 absorbs float comparison noise only.
    const int accepted = wn->set_det_threshold(wnData, requested, 1);
    const float actual = wn->get_det_threshold(wnData, 1);
    if (!accepted || !std::isfinite(actual) || actual <= 0.0f || actual >= 1.0f || std::fabs(actual - requested) > 0.020001f) {
      unload(); failMs = millis() | 1;
      Serial.printf("[WAKE] threshold apply failed requested=%.3f actual=%.3f\\n", requested, actual);
      return false;
    }
    Serial.printf("[WAKE] threshold applied requested=%.3f actual=%.3f\\n", requested, actual);
    chunk ='''),
        ('  if (!mayListen) { stop(); return false; }', '  if (!mayListen) { stop(); return false; }\n  if (wnData && appliedThresholdMilli != Personality::get().wakeThresholdMilli) stop();'),
    ])


PATCHED_MODULES = ("WakeWord.cpp", "WakeWordPolicy.h", "Personality.cpp", "PersonalityPolicy.h")