#pragma once
// v50: local "Hi Stack Chan" wake word (Espressif WakeNet wn9_histackchan_tts3, loaded
// from the "model" flash partition). Runs on the main loop only while WakeWordPolicy allows.
#include <cstdint>

namespace WakeWord {
void begin();                 // discover model; allocate only when idle listening starts
bool available();             // model exists (also true while suspended)
// Call every main-loop pass. Returns true once when the phrase was detected; the mic is
// already released so the caller can start a conversation exactly like a display tap.
bool loop(bool mayListen);
void stop();                  // release mic, model and PCM buffers (idempotent)
uint32_t lastFailureMs();     // millis() of last start failure, 0 = none
bool listening();
}
