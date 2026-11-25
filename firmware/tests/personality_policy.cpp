#include "../src/PersonalityPolicy.h"
#include <cassert>
#include <cstring>
using namespace PersonalityPolicy;
int main() {
  uint32_t c;
  assert(parseHex("#FF8800", c) && c == 0xFF8800);
  assert(!parseHex("FF8800", c) && !parseHex("#FF880", c) && !parseHex("#GG0000", c));
  assert(parseEye("", c) && c == kNoColor);
  assert(parseEye("default", c) && c == kNoColor);
  assert(parseEye("#00ff00", c) && c == 0x00FF00);
  Led l;
  assert(parseLed("off", l) && l.kind == LedKind::Off);
  assert(parseLed("solid:#0000FF", l) && l.kind == LedKind::Solid && l.rgb == 0xFF);
  assert(parseLed("pulse:#FFFFFF", l) && l.kind == LedKind::Pulse);
  assert(parseLed("default", l) && l.kind == LedKind::Default);
  assert(!parseLed("rainbow", l) && !parseLed("solid:red", l));
  assert(rgb565(0xFF0000) == 0xF800 && rgb565(0x00FF00) == 0x07E0 && rgb565(0x0000FF) == 0x001F);
  assert(validSeconds(0) && validSeconds(3600) && !validSeconds(3601) && !validSeconds(-1));
  assert(validBrightness(255) && !validBrightness(256));
  // Menu kept: tap waits for release. Menu off: idle tap starts on touch-down.
  assert(!startOnPress(true, false));
  assert(startOnPress(false, false));
  assert(!startOnPress(false, true));  // during a conversation taps keep release semantics
  assert(holdOpensMenu(true) && !holdOpensMenu(false));
  // Sleep: 0 = never.
  assert(!sleepDue(0, 999999999));
  assert(!sleepDue(45, 45000) && sleepDue(45, 45001));
  Settings s;
  assert(s.statusText && s.listeningWaves && s.eyebrows && s.cheeks);
  assert(!screenOffDue(s, 29999) && screenOffDue(s, 30000));
  s.screenOffAfterS = 0; assert(!screenOffDue(s, 999999999));
  s.sleepFace = false; assert(screenOffDue(s, 0));
  const char* t = "short"; assert(subtitleStart(t, 5) == 0);
  char longText[200]; std::memset(longText, 'a', 199); longText[199] = 0; longText[120] = ' ';
  size_t st = subtitleStart(longText, 199);
  assert(st == 121 && 199 - st <= kSubtitleChars);
  return 0;
}
