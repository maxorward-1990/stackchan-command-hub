#pragma once
#include <cstdint>
#include "ProximityPolicy.h"
namespace Proximity {
struct Reading {
  bool configured = false, configOk = false, statusOk = false, psOk = false, alsOk = false;
  uint32_t configuredMs = 0;
  uint8_t status = 0;
  uint16_t raw = 0, ch0 = 0, ch1 = 0;
  bool psSaturated = false, alsValid = false;
  float luxEstimate = 0;
  const char* error = "";
};
// Diagnostic reads never consume gesture events. One shared configuration owner.
Reading readDiagnostic();
ProximityPolicy::Event loop(bool enabled, bool allowed, uint16_t threshold);
}