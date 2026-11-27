#pragma once
// Plays one robot app on the main loop. Pure (hardware behind Env) so sequences, groups, waits and
// failures are host-tested. v87: steps marked "with_previous" form a group that starts together; the
// group ends when all its waits are done. In a group with speech, the motion starts when the robot
// actually starts talking (connecting takes 1-2 s), so a dance accompanies the words.
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
  virtual bool takePhoto(bool show) = 0;          // capture, store, optionally show
  virtual bool startConversation() = 0;           // same path as a display tap
  virtual bool conversationActive() = 0;
  virtual uint32_t playSound(const char* name) = 0;  // duration in ms, 0 = could not play
  virtual bool overlay(const char* symbol, const char* text, uint32_t ms) = 0;  // v88 over the face
  // v88 "vänta på": arm one event (threshold/dark only for near/light), poll, disarm.
  virtual void armEvent(const char* event, uint32_t threshold, bool dark) = 0;
  virtual bool eventFired() = 0;
  virtual void disarmEvent() = 0;
};

constexpr uint32_t kMotionMinMs = 200, kMotionMaxMs = 15000, kLightsMaxMs = 15000, kSilentTurnMs = 1500;
constexpr uint32_t kTalkStartMs = 10000, kTalkMaxMs = 300000;

// Instructions for speech steps. Tools are named so the model does not add its own dance (seen on v86).
inline std::string speakText(const char* text) {
  return std::string("Säg exakt detta högt och ingenting annat. Anropa inga verktyg (inga rörelser, inget ansiktsuttryck): \"") + text + "\"";
}
inline std::string describeText(const char* prompt) {
  return std::string("Anropa verktyget look_with_camera exakt en gång (inga andra verktyg, inga rörelser) och svara sedan kort och högt på: ") + prompt;
}

class Player {
 public:
  /** steps must stay valid until the run ends (the caller owns the parsed app document). */
  void start(JsonArrayConst steps, const char* name) {
    steps_ = steps; next_ = 0; groupStart_ = 0; running_ = true; error_[0] = 0; groupOpen_ = false;
    std::snprintf(name_, sizeof name_, "%s", name ? name : "");
  }
  void stop(const char* why = "Stoppad.") { if (running_) { running_ = false; eventOn_ = false; std::snprintf(error_, sizeof error_, "%s", why); } }
  /** True while a "vänta på" step is armed (the robot then delivers events to the app instead of starting apps/conversations). */
  bool waitingForEvent() const { return running_ && eventOn_; }
  bool running() const { return running_; }
  int step() const { return groupStart_; }
  const char* name() const { return name_; }
  /** Empty after a successful run. */
  const char* error() const { return error_; }

  void tick(Env& env) {
    if (!running_) return;
    const uint32_t now = env.now();
    if (!groupOpen_) {
      if (next_ >= static_cast<int>(steps_.size())) { running_ = false; return; }
      openGroup(env, now);
      return;
    }
    if (!pollSlots(env, now)) return;  // failed or still waiting
    groupOpen_ = false;
    if (next_ >= static_cast<int>(steps_.size())) running_ = false;
  }

 private:
  JsonArrayConst steps_;
  int next_ = 0, groupStart_ = 0;
  bool running_ = false, groupOpen_ = false;
  char name_[RobotAppPolicy::kNameMax + 1] = {};
  char error_[160] = {};
  // Waits of the open group
  bool untilOn_ = false, motionOn_ = false, speechOn_ = false, lightsOn_ = false, talkOn_ = false, eventOn_ = false, eventContinue_ = false;
  uint32_t eventT0_ = 0, eventMs_ = 0;
  uint32_t untilEnd_ = 0, motionT0_ = 0, speechT0_ = 0, lightsT0_ = 0, talkT0_ = 0, idleSince_ = 0;
  int speechIdx_ = -1, lightsIdx_ = -1, talkIdx_ = -1, deferredMotion_ = -1;
  bool retried_ = false, talkSeen_ = false;
  std::string text_;
  RobotAppPolicy::SpeechWait speech_;

  void failAt(int index, const char* why) {
    const char* kind = steps_[index]["kind"] | "?";
    std::snprintf(error_, sizeof error_, "Steg %d (%s): %s", index + 1, kind, why);
    running_ = false; groupOpen_ = false;
  }
  static uint8_t hex2(const char* s) {
    auto v = [](char c) { return c >= 'a' ? c - 'a' + 10 : c >= 'A' ? c - 'A' + 10 : c - '0'; };
    return static_cast<uint8_t>(v(s[0]) * 16 + v(s[1]));
  }
  void waitUntil(uint32_t now, uint32_t ms) {
    const uint32_t end = now + ms;
    if (!untilOn_ || static_cast<int32_t>(end - untilEnd_) > 0) untilEnd_ = end;
    untilOn_ = true;
  }

  void openGroup(Env& env, uint32_t now) {
    groupOpen_ = true; groupStart_ = next_;
    untilOn_ = motionOn_ = speechOn_ = lightsOn_ = talkOn_ = eventOn_ = false;
    speechIdx_ = lightsIdx_ = talkIdx_ = deferredMotion_ = -1;
    int end = next_ + 1;
    while (end < static_cast<int>(steps_.size()) && RobotAppPolicy::withPrevious(steps_[end], end)) ++end;
    bool hasSpeech = false;
    for (int i = next_; i < end; ++i) {
      const char* k = steps_[i]["kind"] | "";
      if (RobotAppPolicy::roleOf(k) == RobotAppPolicy::Role::Speech && std::strcmp(k, "listen")) hasSpeech = true;
    }
    const int first = next_;
    next_ = end;
    for (int i = first; i < end; ++i) {
      if (hasSpeech && RobotAppPolicy::roleOf(steps_[i]["kind"] | "") == RobotAppPolicy::Role::Motion) { deferredMotion_ = i; continue; }
      if (!execute(env, i, now)) return;
    }
  }

  /** Starts step i; returns false (after failing the run) when the robot could not do it. */
  bool execute(Env& env, int i, uint32_t now) {
    JsonVariantConst a = steps_[i];
    const char* k = a["kind"] | "";
    bool ok = true;
    if (!std::strcmp(k, "led")) {
      const char* c = a["color"] | "#000000";
      ok = std::strlen(c) == 7 && env.led(a["mode"] | "auto", hex2(c + 1), hex2(c + 3), hex2(c + 5));
    } else if (!std::strcmp(k, "emotion")) ok = env.emotion(a["emotion"] | "neutral");
    else if (!std::strcmp(k, "gesture")) { ok = env.gesture(a["gesture"] | ""); if (ok) { motionOn_ = true; motionT0_ = now; } }
    else if (!std::strcmp(k, "look")) {
      const double pan = a["pan"] | 0.0, tilt = a["tilt"] | 0.0;
      ok = env.look(static_cast<int>(std::lround(pan / 90.0 * 1280.0)), static_cast<int>(std::lround(450.0 + tilt / 30.0 * 450.0)));
      if (ok) { motionOn_ = true; motionT0_ = now; }
    } else if (!std::strcmp(k, "text")) ok = env.showText(a["text"] | "");
    else if (!std::strcmp(k, "image")) ok = env.showImage(a["file"] | "");
    else if (!std::strcmp(k, "photo")) ok = env.takePhoto(a["show"] | true);
    else if (!std::strcmp(k, "clear")) env.clearScreen();
    else if (!std::strcmp(k, "speak") || !std::strcmp(k, "ask") || !std::strcmp(k, "describe")) {
      text_ = !std::strcmp(k, "speak") ? speakText(a["text"] | "") : !std::strcmp(k, "describe") ? describeText(a["prompt"] | "") : std::string(a["prompt"] | "");
      retried_ = false; idleSince_ = 0;
      ok = env.requestText(text_.c_str());
      if (ok) { speechOn_ = true; speechT0_ = now; speechIdx_ = i; speech_.begin(now); }
    } else if (!std::strcmp(k, "listen")) { ok = env.startConversation(); if (ok) { talkOn_ = true; talkT0_ = now; talkIdx_ = i; talkSeen_ = false; } }
    else if (!std::strcmp(k, "lights")) { ok = env.lightsStart(a["action"] | "", a["target"] | ""); if (ok) { lightsOn_ = true; lightsT0_ = now; lightsIdx_ = i; } }
    else if (!std::strcmp(k, "todo")) ok = env.todoAdd(a["text"] | "");
    else if (!std::strcmp(k, "timer")) ok = env.timerStart(a["minutes"] | 1);
    else if (!std::strcmp(k, "wait")) waitUntil(now, static_cast<uint32_t>(std::lround((a["seconds"] | 1.0) * 1000.0)));
    else if (!std::strcmp(k, "sound")) { const uint32_t ms = env.playSound(a["sound"] | "beep"); ok = ms > 0; if (ok) waitUntil(now, ms); }
    else if (!std::strcmp(k, "overlay")) ok = env.overlay(a["symbol"] | "none", a["text"] | "", static_cast<uint32_t>(std::lround((a["seconds"] | 3.0) * 1000.0)));
    else if (!std::strcmp(k, "wait_for")) {
      env.armEvent(a["event"] | "", a["threshold"] | 0u, !std::strcmp(a["when"] | "dark", "dark"));
      eventOn_ = true; eventT0_ = now; eventMs_ = (a["seconds"] | 30u) * 1000u; eventContinue_ = !std::strcmp(a["otherwise"] | "stop", "continue");
    }
    else if (!std::strcmp(k, "stop_talk")) env.stopTalk();
    else if (!std::strcmp(k, "reset")) env.resetLook();
    else ok = false;
    if (!ok) failAt(i, "roboten kunde inte utföra steget");
    return ok;
  }

  /** true when every wait of the group is over. */
  bool pollSlots(Env& env, uint32_t now) {
    bool waiting = false;
    if (speechOn_) {
      // A turn can end without any audio (seen on v85 right after an end_session): retry once, then fail.
      if (!speech_.started && env.speechIdle()) {
        if (!idleSince_) idleSince_ = now ? now : 1;
        if (now - idleSince_ >= kSilentTurnMs && now - speechT0_ >= kSilentTurnMs) {
          if (retried_) { failAt(speechIdx_, "Gemini svarade utan ljud"); return false; }
          retried_ = true; idleSince_ = 0; speechT0_ = now;
          if (!env.requestText(text_.c_str())) { failAt(speechIdx_, "roboten kunde inte utföra steget"); return false; }
          speech_.begin(now);
        }
      } else idleSince_ = 0;
      auto r = speech_.update(now, env.speaking());
      if (r == RobotAppPolicy::SpeechWait::NeverStarted) { failAt(speechIdx_, "roboten började inte prata (är Gemini igång?)"); return false; }
      if (r == RobotAppPolicy::SpeechWait::Done) speechOn_ = false; else waiting = true;
    }
    if (deferredMotion_ >= 0 && (speech_.started || !speechOn_)) {  // talking now: start the dance with the words
      const int m = deferredMotion_; deferredMotion_ = -1;
      if (!execute(env, m, now)) return false;
      waiting = true;
    }
    if (motionOn_) {
      if (now - motionT0_ < kMotionMinMs || (env.motionBusy() && now - motionT0_ < kMotionMaxMs)) waiting = true;
      else motionOn_ = false;
    }
    if (lightsOn_) {
      const int r = env.lightsPoll();
      if (r == 0 && now - lightsT0_ < kLightsMaxMs) waiting = true;
      else if (r != 1) { failAt(lightsIdx_, r == 0 ? "lamporna svarade inte inom 15 s" : "lamporna svarade med fel"); return false; }
      else lightsOn_ = false;
    }
    if (talkOn_) {
      const bool active = env.conversationActive();
      if (active) talkSeen_ = true;
      if (!talkSeen_ && now - talkT0_ >= kTalkStartMs) { failAt(talkIdx_, "samtalet startade inte"); return false; }
      if ((talkSeen_ && !active) || now - talkT0_ >= kTalkMaxMs) talkOn_ = false; else waiting = true;
    }
    if (untilOn_) { if (static_cast<int32_t>(now - untilEnd_) < 0) waiting = true; else untilOn_ = false; }
    if (eventOn_) {
      if (env.eventFired()) { env.disarmEvent(); eventOn_ = false; }
      else if (now - eventT0_ >= eventMs_) {
        env.disarmEvent(); eventOn_ = false;
        if (!eventContinue_) { running_ = false; groupOpen_ = false; return false; }  // nothing happened: the app simply ends
      } else waiting = true;
    }
    return !waiting;
  }
};
}  // namespace RobotAppPlayer
