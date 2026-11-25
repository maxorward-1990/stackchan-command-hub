#pragma once
// Pure, host-testable rules for the on-screen menu (320x240 CoreS3 LCD):
// press classification, button grid hit-testing and the on-screen keyboard.
#include <cstdint>
#include <string>

namespace TouchMenuPolicy {
constexpr int kW = 320, kH = 240;
constexpr uint32_t kLongPressMs = 900;   // hold this long on the face to open the menu
constexpr uint32_t kIdleCloseMs = 60000; // menu closes itself after a minute untouched
constexpr size_t kMaxPassword = 63;      // WPA2 passphrase limit
// v58: the menu opens only on a deliberate upward swipe, never on a hold, so a
// stray or long touch cannot pause the wake word or hijack voice control.
constexpr int kSwipeMinPx = 60;
inline bool isSwipeUp(int x0, int y0, int x1, int y1) {
  int dy = y0 - y1, dx = x1 > x0 ? x1 - x0 : x0 - x1;
  return dy >= kSwipeMinPx && dx <= dy;
}

enum class Press { None, Tap, Long };
// Called on release (or while held). Holding past kLongPressMs opens the menu once.
inline Press classify(uint32_t heldMs, bool released) {
  if (heldMs >= kLongPressMs) return Press::Long;
  if (released) return Press::Tap;
  return Press::None;
}

struct Rect { int x, y, w, h; bool hit(int px, int py) const { return px >= x && py >= y && px < x + w && py < y + h; } };

// Grid of buttons below a 32 px title bar. Returns index or -1.
inline Rect gridCell(int index, int cols, int rows) {
  const int top = 36, pad = 6;
  int cw = (kW - pad * (cols + 1)) / cols, ch = (kH - top - pad * (rows + 1)) / rows;
  int c = index % cols, r = index / cols;
  return {pad + c * (cw + pad), top + pad + r * (ch + pad), cw, ch};
}
inline int gridHit(int x, int y, int cols, int rows) {
  for (int i = 0; i < cols * rows; ++i) if (gridCell(i, cols, rows).hit(x, y)) return i;
  return -1;
}

// ---- Keyboard: 4 character rows of 10 keys + action row, under a 64 px text area.
constexpr int kKbTop = 64;
constexpr int kKeyW = 32, kKeyH = 34;
static const char* const kLower[4] = {"1234567890", "qwertyuiop", "asdfghjkl-", "zxcvbnm._@"};
static const char* const kUpper[4] = {"1234567890", "QWERTYUIOP", "ASDFGHJKL-", "ZXCVBNM._@"};
static const char* const kSym[4]   = {"!\"#$%&/()=", "?+*'^~<>|\\", "[]{};:,`-_", "         @"};
enum class Layer { Lower, Upper, Sym };
enum class Action { None, Char, Shift, Symbols, Space, Backspace, Ok, Cancel };
struct Key { Action action = Action::None; char ch = 0; };
inline const char* const* rows(Layer l) { return l == Layer::Upper ? kUpper : l == Layer::Sym ? kSym : kLower; }
// Action row (y = kKbTop + 4*kKeyH): [Aa 48][#! 48][space 96][<- 48][OK 80]
inline Key keyAt(int x, int y, Layer layer) {
  if (y < kKbTop || x < 0 || x >= kW) return {};
  int r = (y - kKbTop) / kKeyH;
  if (r < 4) {
    char c = rows(layer)[r][x / kKeyW];
    if (c == ' ') return {};
    return {Action::Char, c};
  }
  if (r == 4) {
    if (x < 48) return {Action::Shift, 0};
    if (x < 96) return {Action::Symbols, 0};
    if (x < 192) return {Action::Space, 0};
    if (x < 240) return {Action::Backspace, 0};
    return {Action::Ok, 0};
  }
  return {};
}
// Applies a key to the text. Returns true when the user confirmed with OK.
inline bool apply(std::string& text, Layer& layer, const Key& k) {
  switch (k.action) {
    case Action::Char: if (text.size() < kMaxPassword) text += k.ch; if (layer == Layer::Upper) layer = Layer::Lower; return false;
    case Action::Space: if (text.size() < kMaxPassword) text += ' '; return false;
    case Action::Backspace: if (!text.empty()) text.pop_back(); return false;
    case Action::Shift: layer = layer == Layer::Upper ? Layer::Lower : Layer::Upper; return false;
    case Action::Symbols: layer = layer == Layer::Sym ? Layer::Lower : Layer::Sym; return false;
    case Action::Ok: return text.empty() || text.size() >= 8;  // WPA2 needs 8+; empty = open network
    default: return false;
  }
}
// Shell-safe JSON string escape for SSIDs/passwords sent to the config API.
inline std::string jsonEscape(const std::string& s) {
  std::string o;
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (static_cast<unsigned char>(c) < 0x20) { char b[8]; static const char* hx = "0123456789abcdef"; b[0]='\\';b[1]='u';b[2]='0';b[3]='0';b[4]=hx[(c>>4)&15];b[5]=hx[c&15];b[6]=0; o += b; }
    else o += c;
  }
  return o;
}
}  // namespace TouchMenuPolicy
