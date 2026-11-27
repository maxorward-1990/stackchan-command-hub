#pragma once
// v85: plays one robot app's steps in order on the main loop. Pure (hardware behind Env) so the whole
// sequence, waits and failures are host-tested. Each tick does at most one step action and never blocks.
#include "RobotAppPolicy.h"
#include <string>

namespace RobotAppPlayer {
struct Env {
  virtual ~Env() = default;
  virtual uint32_t now() = 0;
  virtual bool led(const char* mode, uint8_t r, uint8_t g, uint8_t b) = 0;
  virtual bool emotion(const char* name) = 0;
  virtual bool gesture(const char* name) = 0;
  virtual bool look(int x, int y) = 0;            // firmware units: x ±1280, y 0…900
  virtual bool motionBusy() = 0;
  virtual bool showText(const char* text) = 0;
  virtual bool showImage(const char* file) = 0;
  virtual void clearScreen() = 0;
  virtual bool requestText(const char* text) = 0; // a Gemini text turn (speaks the answer)
  virtual bool speaking() = 0;
  virtual bool speechIdle() = 0;                  // Gemini is not connecting, waiting or talking (the turn is over)
  virtual bool lightsStart(const char* action, const char* target) = 0;
  virtual int lightsPoll() = 0;                   // 0 still running, 1 done ok, -1 failed
  virtual bool todoAdd(const char* text) = 0;
  virtual bool timerStart(int minutes) = 0;
  virtual void stopTalk() = 0;
  virtual void resetLook() = 0;                   // LEDs auto, screen cleared, neutral face, head centred
};

constexpr uint32_t kMotionMinMs = 200, kMotionMaxMs = 15000, kLightsMaxMs = 15000, kSilentTurnMs = 1500;

class Player {
 public:
  /** steps must stay valid until the run ends (the caller owns the parsed app document). */
  void start(JsonArrayConst steps, const char* name) {
    steps_ = steps; index_ = 0; phase_ = Phase::Next; running_ = true; error_[0] = 0;
    std::snprintf(name_, sizeof name_, "%s", name ? name : "");
  }
  void stop(const char* why = "Stoppad.") { if (running_) { running_ = false; std::snprintf(error_, sizeof error_, "%s", why); } }
  bool running() const { return running_; }
  int step() const { return index_; }
  const char* name() const { return name_; }
  /** Empty after a successful run. */
  const char* error() const { return error_; }

  void tick(Env& env) {
    if (!running_) return;
    const uint32_t now = env.now();
    switch (phase_) {
      case Phase::Next: break;
      case Phase::Until: if (now - t0_ < waitMs_) return; break;
      case Phase::Motion:
        if (now - t0_ < kMotionMinMs) return;
        if (env.motionBusy() && now - t0_ < kMotionMaxMs) return;
        break;
      case Phase::Speech: {
        // A turn can end without any audio (seen on v85 right after an end_session): retry once, then fail.
        if (!speech_.started && env.speechIdle()) {
          if (!idleSince_) idleSince_ = now ? now : 1;
          if (now - idleSince_ >= kSilentTurnMs && now - t0_ >= kSilentTurnMs) {
            if (retried_) { fail("Gemini svarade utan ljud"); return; }
            retried_ = true; idleSince_ = 0;
            if (!env.requestText(text_.c_str())) { fail("roboten kunde inte utföra steget"); return; }
            speech_.begin(now); t0_ = now;
            return;
          }
        } else idleSince_ = 0;
        auto r = speech_.update(now, env.speaking());
        if (r == RobotAppPolicy::SpeechWait::Waiting) return;
        if (r == RobotAppPolicy::SpeechWait::NeverStarted) { fail("roboten började inte prata (är Gemini igång?)"); return; }
        break;
      }
      case Phase::Lights: {
        int r = env.lightsPoll();
        if (r == 0 && now - t0_ < kLightsMaxMs) return;
        if (r != 1) { fail(r == 0 ? "lamporna svarade inte inom 15 s" : "lamporna svarade med fel"); return; }
        break;
      }
    }
    if (phase_ != Phase::Next) { ++index_; phase_ = Phase::Next; }
    if (index_ >= static_cast<int>(steps_.size())) { running_ = false; return; }
    execute(env, steps_[index_], now);
  }

 private:
  enum class Phase { Next, Until, Motion, Speech, Lights };
  JsonArrayConst steps_;
  int index_ = 0;
  Phase phase_ = Phase::Next;
  bool running_ = false;
  uint32_t t0_ = 0, waitMs_ = 0, idleSince_ = 0;
  bool retried_ = false;
  std::string text_;
  RobotAppPolicy::SpeechWait speech_;
  char name_[RobotAppPolicy::kNameMax + 1] = {};
  char error_[160] = {};

  void fail(const char* why) {
    const char* kind = steps_[index_]["kind"] | "?";
    std::snprintf(error_, sizeof error_, "Steg %d (%s): %s", index_ + 1, kind, why);
    running_ = false;
  }
  void wait(Phase p, uint32_t now, uint32_t ms = 0) { phase_ = p; t0_ = now; waitMs_ = ms; }
  static uint8_t hex2(const char* s) {
    auto v = [](char c) { return c >= 'a' ? c - 'a' + 10 : c >= 'A' ? c - 'A' + 10 : c - '0'; };
    return static_cast<uint8_t>(v(s[0]) * 16 + v(s[1]));
  }

  void execute(Env& env, JsonVariantConst a, uint32_t now) {
    const char* k = a["kind"] | "";
    bool ok = true;
    if (!std::strcmp(k, "led")) {
      const char* c = a["color"] | "#000000";
      ok = std::strlen(c) == 7 && env.led(a["mode"] | "auto", hex2(c + 1), hex2(c + 3), hex2(c + 5));
    } else if (!std::strcmp(k, "emotion")) ok = env.emotion(a["emotion"] | "neutral");
    else if (!std::strcmp(k, "gesture")) { ok = env.gesture(a["gesture"] | ""); if (ok) { wait(Phase::Motion, now); return; } }
    else if (!std::strcmp(k, "look")) {
      const double pan = a["pan"] | 0.0, tilt = a["tilt"] | 0.0;
      ok = env.look(static_cast<int>(std::lround(pan / 90.0 * 1280.0)), static_cast<int>(std::lround(450.0 + tilt / 30.0 * 450.0)));
      if (ok) { wait(Phase::Motion, now); return; }
    } else if (!std::strcmp(k, "text")) ok = env.showText(a["text"] | "");
    else if (!std::strcmp(k, "image")) ok = env.showImage(a["file"] | "");
    else if (!std::strcmp(k, "clear")) env.clearScreen();
    else if (!std::strcmp(k, "speak") || !std::strcmp(k, "ask")) {
      std::string text = !std::strcmp(k, "speak") ? std::string("Säg exakt detta högt, ingenting annat: \"") + (a["text"] | "") + "\"" : std::string(a["prompt"] | "");
      text_ = text; retried_ = false; idleSince_ = 0;
      ok = env.requestText(text.c_str());
      if (ok) { speech_.begin(now); wait(Phase::Speech, now); return; }
    } else if (!std::strcmp(k, "lights")) { ok = env.lightsStart(a["action"] | "", a["target"] | ""); if (ok) { wait(Phase::Lights, now); return; } }
    else if (!std::strcmp(k, "todo")) ok = env.todoAdd(a["text"] | "");
    else if (!std::strcmp(k, "timer")) ok = env.timerStart(a["minutes"] | 1);
    else if (!std::strcmp(k, "wait")) { wait(Phase::Until, now, static_cast<uint32_t>(std::lround((a["seconds"] | 1.0) * 1000.0))); return; }
    else if (!std::strcmp(k, "stop_talk")) env.stopTalk();
    else if (!std::strcmp(k, "reset")) env.resetLook();
    else ok = false;
    if (!ok) { fail("roboten kunde inte utföra steget"); return; }
    ++index_;
    if (index_ >= static_cast<int>(steps_.size())) running_ = false;
  }
};
}  // namespace RobotAppPlayer
