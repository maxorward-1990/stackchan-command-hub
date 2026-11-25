#pragma once
// Pure Pomodoro state machine driven by millis(); no hardware, fully offline.
#include <cstdint>
namespace PomodoroPolicy {
constexpr int kFocusMax = 90, kBreakMax = 30, kRoundsMax = 8;
constexpr int kFocusMinSec = 10, kFocusMaxSec = kFocusMax * 60;
// Bottom widget band (y >= kWidgetTop on the 240 px face): a tap there stops a visible timer instead of starting voice.
constexpr int kWidgetTop = 170;
inline bool widgetTap(int y) { return y >= kWidgetTop && y < 240; }
enum class Phase { Off, Focus, Break, Done };
inline bool valid(int focusMin, int breakMin, int rounds) {
  return focusMin >= 1 && focusMin <= kFocusMax && breakMin >= 1 && breakMin <= kBreakMax && rounds >= 1 && rounds <= kRoundsMax;
}
inline bool validSec(int focusSec, int breakMin, int rounds) {
  return focusSec >= kFocusMinSec && focusSec <= kFocusMaxSec && breakMin >= 1 && breakMin <= kBreakMax && rounds >= 1 && rounds <= kRoundsMax;
}
// Touch stepper in seconds: sub-minute steps first, then the minute steps.
inline constexpr int kStepsSec[] = {15, 30, 45, 60, 120, 180, 300, 600, 900, 1200, 1500, 1800, 2700, 3600, 5400};
inline int stepSeconds(int cur, int dir) {
  constexpr int n = int(sizeof kStepsSec / sizeof kStepsSec[0]);
  if (dir > 0) { for (int i = 0; i < n; ++i) if (kStepsSec[i] > cur) return kStepsSec[i]; return kStepsSec[n - 1]; }
  for (int i = n - 1; i >= 0; --i) if (kStepsSec[i] < cur) return kStepsSec[i];
  return kStepsSec[0];
}
// Touch stepper for focus minutes: coarse steps, clamped at both ends.
inline constexpr int kSteps[] = {1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90};
inline int stepMinutes(int cur, int dir) {
  constexpr int n = int(sizeof kSteps / sizeof kSteps[0]);
  if (dir > 0) { for (int i = 0; i < n; ++i) if (kSteps[i] > cur) return kSteps[i]; return kSteps[n - 1]; }
  for (int i = n - 1; i >= 0; --i) if (kSteps[i] < cur) return kSteps[i];
  return kSteps[0];
}
struct Timer {
  int focusMin = 25, breakMin = 5, rounds = 4;
  Phase phase = Phase::Off;
  int round = 0;
  bool paused = false;
  uint32_t remaining = 0, last = 0, doneAt = 0, focusMs = 0, breakMs = 0;
  bool start(int f, int b, int r, uint32_t now) { return valid(f, b, r) && startSec(f * 60, b, r, now); }
  bool startSec(int fs, int b, int r, uint32_t now) {
    if (!validSec(fs, b, r)) return false;
    focusMin = (fs + 59) / 60; breakMin = b; rounds = r; phase = Phase::Focus; round = 1; paused = false;
    focusMs = uint32_t(fs) * 1000; breakMs = uint32_t(b) * 60000;
    remaining = focusMs; last = now; doneAt = 0; return true;
  }
  void stop() { phase = Phase::Off; round = 0; paused = false; remaining = 0; }
  bool active() const { return phase == Phase::Focus || phase == Phase::Break; }
  // Advances time; returns true when the phase changed (caller may show a cue).
  bool tick(uint32_t now) {
    if (!active() || paused) { last = now; return false; }
    uint32_t dt = now - last; last = now; bool changed = false;
    while (active() && dt >= remaining) {
      dt -= remaining; changed = true;
      if (phase == Phase::Focus) {
        if (round >= rounds) { phase = Phase::Done; remaining = 0; doneAt = now; return true; }
        phase = Phase::Break; remaining = breakMs;
      } else { phase = Phase::Focus; ++round; remaining = focusMs; }
    }
    if (active()) remaining -= dt;
    return changed;
  }
  void pause(uint32_t now) { tick(now); if (active()) paused = true; }
  void resume(uint32_t now) { if (active() && paused) { paused = false; last = now; } }
  int progressPermille() const {
    if (!active()) return phase == Phase::Done ? 1000 : 0;
    const uint32_t total = phase == Phase::Focus ? focusMs : breakMs;
    return int((uint64_t(total - remaining) * 1000) / total);
  }
};
}  // namespace PomodoroPolicy
