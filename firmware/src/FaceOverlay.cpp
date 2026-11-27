#include "FaceOverlay.h"
#include <algorithm>
#include <cstring>
namespace {
char g_symbol[12] = "none";
String g_text;
uint32_t g_until = 0;
bool g_on = false;
}
namespace FaceOverlay {
bool validSymbol(const char* s) {
  if (!s) return false;
  for (const char* x : {"heart", "star", "question", "exclaim", "zzz", "note", "none"}) if (!std::strcmp(s, x)) return true;
  return false;
}
void set(const char* symbol, const char* text, uint32_t ms) {
  std::snprintf(g_symbol, sizeof g_symbol, "%s", validSymbol(symbol) ? symbol : "none");
  g_text = text ? text : "";
  g_until = millis() + ms; g_on = true;
}
void clear() { g_on = false; g_text = ""; }
bool active() { return g_on && static_cast<int32_t>(g_until - millis()) > 0; }
bool expired() {
  if (g_on && !active()) { clear(); return true; }
  return false;
}
void draw(M5Canvas& c) {
  if (!active()) return;
  const int x = c.width() - 52, y = 44;  // top right, clear of the eyes
  const uint16_t pink = 0xF8B2, yellow = 0xFFE0, white = TFT_WHITE;
  if (!std::strcmp(g_symbol, "heart")) {
    c.fillCircle(x - 11, y - 6, 13, pink); c.fillCircle(x + 11, y - 6, 13, pink);
    c.fillTriangle(x - 24, y - 1, x + 24, y - 1, x, y + 26, pink);
  } else if (!std::strcmp(g_symbol, "star")) {
    c.fillTriangle(x, y - 26, x - 9, y - 4, x + 9, y - 4, yellow);
    c.fillTriangle(x - 26, y - 6, x + 26, y - 6, x, y + 8, yellow);
    c.fillTriangle(x, y + 2, x - 18, y + 24, x - 6, y - 2, yellow);
    c.fillTriangle(x, y + 2, x + 18, y + 24, x + 6, y - 2, yellow);
  } else if (std::strcmp(g_symbol, "none")) {
    const char* glyph = !std::strcmp(g_symbol, "question") ? "?" : !std::strcmp(g_symbol, "exclaim") ? "!" : !std::strcmp(g_symbol, "zzz") ? "Zzz" : "#";
    if (!std::strcmp(g_symbol, "note")) {  // a quaver drawn with shapes (no music font)
      c.fillEllipse(x - 8, y + 16, 10, 7, white); c.fillRect(x, y - 22, 4, 38, white); c.fillTriangle(x + 4, y - 22, x + 20, y - 10, x + 4, y - 8, white);
    } else {
      c.setFont(&fonts::efontJA_16); c.setTextSize(3); c.setTextDatum(middle_center); c.setTextColor(yellow);
      c.drawString(glyph, x, y);
      c.setTextSize(1);
    }
  }
  if (g_text.length()) {
    c.setFont(&fonts::efontJA_16); c.setTextSize(1); c.setTextDatum(top_center);
    const int w = std::min<int>(c.width() - 16, static_cast<int>(c.textWidth(g_text)) + 16);
    c.fillRoundRect((c.width() - w) / 2, 4, w, 24, 8, TFT_BLACK);
    c.drawRoundRect((c.width() - w) / 2, 4, w, 24, 8, white);
    c.setTextColor(white); c.drawString(g_text, c.width() / 2, 8);
  }
}
}
