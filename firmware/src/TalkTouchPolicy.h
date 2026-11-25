#pragma once
#include <cstdint>
// Pure rules for screen taps during voice chat (v29 manual turn control, v30 timing fixes):
//   tap  -> start listening / send what was said / interrupt the reply
//   hold -> end the conversation (opens the menu only when no conversation runs)
namespace TalkTouchPolicy {
enum class Action { Start, SendTurn, Interrupt, EndConversation, OpenMenu, None };

constexpr uint32_t kEndHoldMs = 1000;     // deliberate hold to end a running conversation
constexpr uint32_t kMenuHoldMs = 900;      // hold when idle to open the menu
constexpr uint32_t kMenuCooldownMs = 1500; // no menu right after a conversation ended
constexpr uint16_t kSpeechRms = 250;       // below this the whole turn counts as silence

inline uint32_t holdThresholdMs(bool conversation) { return conversation ? kEndHoldMs : kMenuHoldMs; }

// A listening/startup tap always finishes input; volume is not a touch permission.
inline Action onTap(bool conversation, bool canInterrupt, bool recording, bool heardSpeech = true) {
  (void)recording; (void)heardSpeech;
  if (canInterrupt) return Action::Interrupt;
  return conversation ? Action::SendTurn : Action::Start;
}

// msSinceConversationEnd: time since the conversation stopped (large value if never).
// A hold that races a timeout must not pop up the menu under the finger.
inline Action onLongPress(bool conversation, uint32_t msSinceConversationEnd = 0xFFFFFFFFu) {
  if (conversation) return Action::EndConversation;
  return msSinceConversationEnd < kMenuCooldownMs ? Action::None : Action::OpenMenu;
}
// v59: silence padding sent before audioStreamEnd so server VAD closes the turn.
inline uint32_t tapSilencePadMs(uint16_t vadSilenceMs) { uint32_t m = vadSilenceMs + 300u; return m > 2000u ? 2000u : m; }
// One 125 ms packet per main-loop deadline; never flood the bounded WS queue.
struct SilenceTail {
  uint32_t remainingMs = 0, nextMs = 0;
  void cancel() { remainingMs = 0; nextMs = 0; }
  void start(uint32_t now, uint16_t vadMs) { remainingMs = tapSilencePadMs(vadMs); nextMs = now; }
  bool due(uint32_t now) const { return remainingMs && static_cast<int32_t>(now - nextMs) >= 0; }
  void sent(uint32_t now) { remainingMs = remainingMs > 125 ? remainingMs - 125 : 0; nextMs = now + 125; }
  bool done(uint32_t now) const { return !remainingMs && static_cast<int32_t>(now - nextMs) >= 0; }
};
inline bool heardSpeech(uint16_t turnPeakRms) { return turnPeakRms >= kSpeechRms; }
}
