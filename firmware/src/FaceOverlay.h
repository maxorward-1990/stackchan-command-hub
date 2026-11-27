#pragma once
// v88: a symbol and/or short text drawn on top of the face for a while (robot-app step "Visa över ansiktet").
// Drawn inside EmotionController::renderFace after the panel, so the face keeps reacting underneath.
#include <Arduino.h>
#include <M5GFX.h>
namespace FaceOverlay {
bool validSymbol(const char* s);                 // heart, star, question, exclaim, zzz, note, none
void set(const char* symbol, const char* text, uint32_t ms);
void clear();
bool active();
/** True once when the overlay expired since the last call (the face must be redrawn without it). */
bool expired();
void draw(M5Canvas& canvas);
}
