#include "TouchMenu.h"
#include <M5Unified.h>
#include <M5StackChan.h>
#include <WiFi.h>
#include "BleBridge.h"
#include "ScreenImage.h"
#include "TouchMenuPolicy.h"
#include "MenuPagerPolicy.h"

using namespace TouchMenuPolicy;

namespace {
enum class Screen { Main, Wifi, Keyboard, Bluetooth, Volume, Info, Message };
TouchMenu::Hooks H;
bool g_active = false;
Screen g_screen = Screen::Main;
uint32_t g_lastTouch = 0;
bool g_wasPressed = false;
// Wi-Fi list
constexpr int kMaxNets = 20, kPerPage = 4;
String g_ssid[kMaxNets]; int g_rssi[kMaxNets]; bool g_open[kMaxNets]; int g_netCount = 0, g_page = 0;
String g_chosen; std::string g_pass; Layer g_layer = Layer::Lower; bool g_showPass = true;
String g_msg;
// Carousel: page 0 settings, page 1 clock app, page 2 focus timer, pages 3+ robot apps (v85, 4 per page).
// Main-screen touches act on release so swipes can be told from taps.
constexpr int kFixedPages = 3, kAppsPerPage = 4;
int rappCount() { return H.rappCount ? H.rappCount() : 0; }
int menuPages() { const int n = rappCount(); return kFixedPages + (n > 0 ? (n + kAppsPerPage - 1) / kAppsPerPage : 1); }
const Rect kAppRects[kAppsPerPage] = {{6, 40, 150, 52}, {164, 40, 150, 52}, {6, 98, 150, 52}, {164, 98, 150, 52}};
const Rect kAppStop{6, 156, 98, 48}, kAppReset{110, 156, 98, 48}, kAppSd{214, 156, 100, 48};
String shortLabel(const String& s, size_t maxBytes = 16) {  // UTF-8 safe cut for a 150 px button
  if (s.length() <= maxBytes) return s;
  size_t n = maxBytes - 2;
  while (n > 0 && (static_cast<uint8_t>(s[n]) & 0xC0) == 0x80) --n;
  return s.substring(0, n) + "..";
}
int g_menuPage = 0, g_px0 = -1, g_py0 = 0, g_px1 = 0, g_py1 = 0;
String g_appMsg;

lgfx::LGFXBase& D() { return M5StackChan.Display(); }
const uint16_t BG = TFT_BLACK, FG = TFT_WHITE, ACC = 0x05FF, BTN = 0x2124, WARN = 0xFB20;

void title(const char* t, bool back = true) {
  auto& d = D();
  d.fillScreen(BG);
  d.setFont(&fonts::efontJA_16); d.setTextSize(1);
  d.fillRect(0, 0, kW, 32, ACC);
  d.setTextColor(BG, ACC); d.setTextDatum(middle_left);
  d.drawString(t, back ? 44 : 8, 16);
  if (back) { d.setTextDatum(middle_center); d.drawString("<", 18, 16); }
}
void button(const Rect& r, const String& label, uint16_t col = BTN) {
  auto& d = D();
  d.fillRoundRect(r.x, r.y, r.w, r.h, 8, col);
  d.setTextColor(FG, col); d.setTextDatum(middle_center);
  d.drawString(label, r.x + r.w / 2, r.y + r.h / 2);
}
bool backHit(int x, int y) { return y < 32 && x < 60; }

// ---------- screens
void pagerChrome(const char* t) {
  title(t, true);
  auto& d = D(); d.setTextColor(BG, ACC);
  d.setTextDatum(middle_center); d.drawString(">", kW - 80, 16);
  d.setTextDatum(middle_right); d.drawString("X", kW - 12, 16);
  const int pages = menuPages(), x0 = pages > kFixedPages + 1 ? 156 : 190, dx = pages > kFixedPages + 1 ? 11 : 14;
  for (int i = 0; i < pages; ++i) { int cx = x0 + i * dx; if (i == g_menuPage) d.fillCircle(cx, 16, 4, BG); else d.drawCircle(cx, 16, 4, BG); }
}
void drawMain() {
  if (g_menuPage >= menuPages()) g_menuPage = 0;
  if (g_menuPage >= kFixedPages) {
    pagerChrome("Mina appar");
    auto& d = D();
    const int n = rappCount(), first = (g_menuPage - kFixedPages) * kAppsPerPage;
    if (!n) { d.setTextDatum(top_left); d.setTextColor(FG, BG); d.drawString("Inga appar på roboten.", 10, 52); d.drawString("Skicka en från Command Hub", 10, 76); d.drawString("eller läs in från SD-kort.", 10, 96); }
    for (int i = 0; i < kAppsPerPage && first + i < n; ++i) button(kAppRects[i], shortLabel(H.rappName ? H.rappName(first + i) : String("?")), ACC);
    button(kAppStop, "Stopp", WARN); button(kAppReset, "Återställ"); button(kAppSd, "SD-kort");
    String status = g_appMsg.length() ? g_appMsg : (H.rappStatus ? H.rappStatus() : String());
    if (status.length()) { d.setTextColor(WARN, BG); d.setTextDatum(top_left); d.drawString(shortLabel(status, 38), 6, 212); }
    return;
  }
  if (g_menuPage == 2) {
    pagerChrome("Fokus");
    auto& d = D(); d.setTextDatum(top_left);
    d.setTextColor(ACC, BG); d.drawString("Fokustimer", 10, 44);
    const String label = H.focusLabel ? H.focusLabel() : String();
    const int st = H.focusState ? H.focusState() : 0;
    d.setTextColor(FG, BG);
    if (st) d.drawString(label, 10, 70);
    else {
      button({6, 62, 60, 48}, "-"); button({254, 62, 60, 48}, "+");
      d.setTextDatum(middle_center); d.setTextColor(FG, BG); d.drawString(label, 160, 86); d.setTextDatum(top_left);
    }
    if (st) { button({6, 118, 150, 60}, st == 2 ? "Fortsätt" : "Paus", ACC); button({164, 118, 150, 60}, "Stopp", WARN); }
    else { button({6, 118, 150, 60}, "Helskärm", ACC); button({164, 118, 150, 60}, "Widget"); }
    if (g_appMsg.length()) { d.setTextColor(WARN, BG); d.setTextDatum(top_left); d.drawString(g_appMsg, 10, 192); }
    return;
  }
  if (g_menuPage == 1) {
    pagerChrome("Appar");
    auto& d = D(); d.setTextDatum(top_left);
    d.setTextColor(ACC, BG); d.drawString("Klocka & Väder", 10, 44);
    String place = H.appLabel ? H.appLabel() : String();
    d.setTextColor(FG, BG);
    if (place.length()) d.drawString(place, 10, 70);
    else { d.drawString("Ingen app sparad ännu.", 10, 70); d.drawString("Starta den en gång från Command Hub.", 10, 90); }
    button({6, 118, 150, 60}, "Helskärm", place.length() ? ACC : BTN);
    button({164, 118, 150, 60}, "Widget");
    if (g_appMsg.length()) { d.setTextColor(WARN, BG); d.setTextDatum(top_left); d.drawString(g_appMsg, 10, 192); }
    return;
  }
  pagerChrome("Inställningar");
  const char* labels[6] = {"Wi-Fi", "Bluetooth", "Volym", "Info", "Starta om", "Stäng"};
  for (int i = 0; i < 6; ++i) button(gridCell(i, 2, 3), labels[i], i == 4 ? WARN : BTN);
}
void drawWifi() {
  title("Välj Wi-Fi");
  auto& d = D();
  if (!g_netCount) { d.setTextColor(FG, BG); d.setTextDatum(middle_center); d.drawString("Inga nätverk hittades", kW / 2, 120); }
  for (int i = 0; i < kPerPage; ++i) {
    int n = g_page * kPerPage + i; if (n >= g_netCount) break;
    Rect r{6, 38 + i * 44, kW - 12, 40};
    String l = g_ssid[n].substring(0, 22) + (g_open[n] ? "  (öppet)" : "") ;
    d.fillRoundRect(r.x, r.y, r.w, r.h, 6, BTN);
    d.setTextColor(FG, BTN); d.setTextDatum(middle_left); d.drawString(l, r.x + 8, r.y + 20);
    d.setTextDatum(middle_right); d.drawString(String(g_rssi[n]) + " dBm", r.x + r.w - 8, r.y + 20);
  }
  button({6, 216, 100, 22}, "Föreg.");
  button({110, 216, 100, 22}, "Sök igen");
  button({214, 216, 100, 22}, "Nästa");
}
void scanWifi() {
  title("Söker nätverk...");
  wifi_mode_t m = WiFi.getMode();
  if (m == WIFI_OFF) WiFi.mode(WIFI_STA); else if (m == WIFI_AP) WiFi.mode(WIFI_AP_STA);
  int n = WiFi.scanNetworks(false, false);
  g_netCount = 0;
  for (int i = 0; i < n && g_netCount < kMaxNets; ++i) {
    String s = WiFi.SSID(i); if (!s.length()) continue;
    bool dup = false; for (int j = 0; j < g_netCount; ++j) if (g_ssid[j] == s) dup = true;
    if (dup) continue;
    g_ssid[g_netCount] = s; g_rssi[g_netCount] = WiFi.RSSI(i); g_open[g_netCount] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN; ++g_netCount;
  }
  WiFi.scanDelete();
  g_page = 0;
  Serial.printf("Menu: wifi scan found %d\n", g_netCount);
}
void drawKeyboard() {
  auto& d = D();
  d.fillScreen(BG);
  d.setFont(&fonts::efontJA_16);
  d.setTextColor(ACC, BG); d.setTextDatum(top_left);
  d.drawString("< " + g_chosen.substring(0, 24), 4, 2);
  d.fillRect(4, 24, kW - 8, 34, BTN);
  d.setTextColor(FG, BTN); d.setTextDatum(middle_left);
  std::string shown = g_showPass ? g_pass : std::string(g_pass.size(), '*');
  if (shown.size() > 30) shown = shown.substr(shown.size() - 30);
  d.drawString((String(shown.c_str()) + "_"), 10, 41);
  d.setTextDatum(middle_right); d.drawString(g_showPass ? "dölj" : "visa", kW - 10, 41);
  auto r = rows(g_layer);
  d.setTextDatum(middle_center);
  for (int row = 0; row < 4; ++row)
    for (int c = 0; c < 10; ++c) {
      int x = c * kKeyW, y = kKbTop + row * kKeyH;
      d.fillRoundRect(x + 1, y + 1, kKeyW - 2, kKeyH - 2, 4, BTN);
      char s[2] = {r[row][c], 0};
      d.setTextColor(FG, BTN); d.drawString(s, x + kKeyW / 2, y + kKeyH / 2);
    }
  int y = kKbTop + 4 * kKeyH;
  button({1, y + 1, 46, kKeyH - 2}, g_layer == Layer::Upper ? "abc" : "Aa");
  button({49, y + 1, 46, kKeyH - 2}, g_layer == Layer::Sym ? "abc" : "#!");
  button({97, y + 1, 94, kKeyH - 2}, "mellanslag");
  button({193, y + 1, 46, kKeyH - 2}, "<-");
  button({241, y + 1, 78, kKeyH - 2}, "Anslut", ACC);
}
void drawBluetooth() {
  title("Bluetooth");
  auto& d = D();
  d.setTextColor(FG, BG); d.setTextDatum(top_left);
  bool on = BleBridge::enabled();
  d.drawString(on ? (BleBridge::connected() ? "Status: ansluten" : "Status: synlig, väntar") : "Status: av", 10, 42);
  if (on) {
    d.drawString("Namn: " + H.robotName, 10, 64);
    d.drawString("PIN vid parkoppling:", 10, 86);
    d.setTextSize(2); d.setTextColor(ACC, BG);
    char p[8]; snprintf(p, sizeof p, "%06u", (unsigned)BleBridge::pin()); d.drawString(p, 10, 106);
    d.setTextSize(1);
  } else {
    d.drawString("Slå på för att styra från", 10, 70);
    d.drawString("telefonen i Command Hub.", 10, 90);
  }
  button({6, 150, 150, 40}, on ? "Stäng av" : "Slå på", on ? WARN : ACC);
  bool boot = H.bleAtBoot && H.bleAtBoot();
  button({164, 150, 150, 40}, boot ? "Vid start: på" : "Vid start: av");
  d.setTextColor(0x8410, BG); d.setTextDatum(top_left);
  d.drawString("Stäng av när du inte använder den.", 6, 200);
}
void drawVolume() {
  title("Volym");
  auto& d = D();
  uint8_t v = H.getVolume ? H.getVolume() : 0;
  d.setTextColor(FG, BG); d.setTextDatum(middle_center); d.setTextSize(2);
  d.drawString(String(v * 100 / 255) + " %", kW / 2, 80); d.setTextSize(1);
  d.drawRect(20, 110, kW - 40, 16, FG); d.fillRect(22, 112, (kW - 44) * v / 255, 12, ACC);
  button({6, 150, 150, 60}, "-");
  button({164, 150, 150, 60}, "+");
}
void drawInfo() {
  title("Info");
  auto& d = D();
  d.setTextColor(FG, BG); d.setTextDatum(top_left);
  bool wl = WiFi.status() == WL_CONNECTED;
  int y = 40;
  auto line = [&](const String& s) { d.drawString(s, 8, y); y += 22; };
  line("Firmware: " + H.firmware);
  line("Wi-Fi: " + (wl ? WiFi.SSID() + " " + String(WiFi.RSSI()) + " dBm" : String("ej ansluten")));
  line("IP: " + (wl ? WiFi.localIP().toString() : (WiFi.getMode() & WIFI_AP) ? WiFi.softAPIP().toString() + " (setup)" : String("-")));
  line("Bluetooth: " + String(BleBridge::enabled() ? (BleBridge::connected() ? "ansluten" : "på") : "av"));
  line("Batteri: " + String(M5.Power.getBatteryLevel()) + " %");
  line("Minne: " + String(ESP.getFreeHeap() / 1024) + " kB / PSRAM " + String(ESP.getFreePsram() / 1024) + " kB");
  line("Drifttid: " + String(millis() / 60000) + " min");
}
void drawMessage() {
  title(g_msg.c_str(), false);
}
void draw() {
  switch (g_screen) {
    case Screen::Main: drawMain(); break;
    case Screen::Wifi: drawWifi(); break;
    case Screen::Keyboard: drawKeyboard(); break;
    case Screen::Bluetooth: drawBluetooth(); break;
    case Screen::Volume: drawVolume(); break;
    case Screen::Info: drawInfo(); break;
    case Screen::Message: drawMessage(); break;
  }
}
void go(Screen s) { g_screen = s; g_px0 = -1; draw(); }
void close() {
  g_active = false; g_pass.clear();
  Serial.println("Menu: closed");
  if (H.onClose) H.onClose();
}
void connectChosen() {
  g_msg = "Sparar, startar om...";
  go(Screen::Message);
  String pw = String(jsonEscape(g_pass).c_str());
  String ss = String(jsonEscape(std::string(g_chosen.c_str())).c_str());
  g_pass.assign(g_pass.size(), '\0'); g_pass.clear();
  // Never log the password. Save secret first, then SSID + reboot.
  String r1 = H.api(true, "/api/secrets", "{\"wifi_password\":\"" + pw + "\"}");
  Serial.printf("Menu: wifi secret save -> %s\n", r1.substring(0, 3).c_str());
  pw = "";
  H.api(true, "/api/runtime", "{\"wifi_ssid\":\"" + ss + "\",\"wifi_enabled\":true,\"web_enabled\":true,\"reboot\":true}");
}

void tap(int x, int y) {
  switch (g_screen) {
    case Screen::Main: {
      using MenuPagerPolicy::Title;
      switch (MenuPagerPolicy::titleHit(x, y)) {
        case Title::Close: close(); return;
        case Title::Prev: g_menuPage = MenuPagerPolicy::step(g_menuPage, menuPages(), MenuPagerPolicy::Gesture::Prev); g_appMsg = ""; draw(); return;
        case Title::Next: g_menuPage = MenuPagerPolicy::step(g_menuPage, menuPages(), MenuPagerPolicy::Gesture::Next); g_appMsg = ""; draw(); return;
        default: break;
      }
      if (y < 32) return;
      if (g_menuPage >= kFixedPages) {
        const int first = (g_menuPage - kFixedPages) * kAppsPerPage, n = rappCount();
        for (int i = 0; i < kAppsPerPage; ++i) {
          if (first + i >= n || !kAppRects[i].hit(x, y)) continue;
          String err = H.rappStart ? H.rappStart(first + i) : String("Stöds ej");
          if (err.length()) { g_appMsg = err; draw(); return; }
          g_appMsg = ""; close(); return;
        }
        if (kAppStop.hit(x, y)) { if (H.rappStop) H.rappStop(); g_appMsg = "Stoppad."; draw(); return; }
        if (kAppReset.hit(x, y)) { if (H.rappReset) H.rappReset(); g_appMsg = "Återställd."; draw(); return; }
        if (kAppSd.hit(x, y)) { g_appMsg = "Läser SD-kort..."; draw(); g_appMsg = H.rappImportSd ? H.rappImportSd() : String("Stöds ej"); draw(); return; }
        return;
      }
      if (g_menuPage == 2) {
        const int st0 = H.focusState ? H.focusState() : 0;
        if (!st0 && H.focusAdjust && (Rect{6, 62, 60, 48}.hit(x, y) || Rect{254, 62, 60, 48}.hit(x, y))) {
          H.focusAdjust(x < 160 ? -1 : 1); g_appMsg = ""; draw(); return;
        }
        const bool left = Rect{6, 118, 150, 60}.hit(x, y);
        if (!left && !Rect{164, 118, 150, 60}.hit(x, y)) return;
        const int st = H.focusState ? H.focusState() : 0;
        const int act = st ? (left ? 2 : 3) : (left ? 1 : 0);
        String err = H.focusAction ? H.focusAction(act) : String("Stöds ej");
        if (err.length()) { g_appMsg = err; draw(); return; }
        g_appMsg = "";
        if (act <= 1) close(); else draw();
        return;
      }
      if (g_menuPage == 1) {
        const bool full = Rect{6, 118, 150, 60}.hit(x, y);
        if (!full && !Rect{164, 118, 150, 60}.hit(x, y)) return;
        String err = H.appStart ? H.appStart(full) : String("Stöds ej");
        if (err.length()) { g_appMsg = err; draw(); return; }
        g_appMsg = ""; close(); return;
      }
      switch (gridHit(x, y, 2, 3)) {
        case 0: scanWifi(); go(Screen::Wifi); break;
        case 1: go(Screen::Bluetooth); break;
        case 2: go(Screen::Volume); break;
        case 3: go(Screen::Info); break;
        case 4: g_msg = "Startar om..."; go(Screen::Message); delay(400); ESP.restart(); break;
        case 5: close(); break;
      }
      return;
    }
    case Screen::Wifi:
      if (backHit(x, y)) { go(Screen::Main); return; }
      if (y >= 214) {
        if (x < 108 && g_page > 0) --g_page;
        else if (x >= 108 && x < 212) scanWifi();
        else if (x >= 212 && (g_page + 1) * kPerPage < g_netCount) ++g_page;
        draw(); return;
      }
      for (int i = 0; i < kPerPage; ++i) {
        int n = g_page * kPerPage + i;
        if (n < g_netCount && Rect{6, 38 + i * 44, kW - 12, 40}.hit(x, y)) {
          g_chosen = g_ssid[n]; g_pass.clear(); g_layer = Layer::Lower;
          if (g_open[n]) connectChosen(); else go(Screen::Keyboard);
          return;
        }
      }
      return;
    case Screen::Keyboard: {
      if (y < 22 && x < 120) { g_pass.clear(); go(Screen::Wifi); return; }
      if (y >= 24 && y < 58 && x > kW - 60) { g_showPass = !g_showPass; draw(); return; }
      Key k = keyAt(x, y, g_layer);
      if (k.action == Action::None) return;
      if (apply(g_pass, g_layer, k)) { connectChosen(); return; }
      if (k.action == Action::Ok) { g_msg = "Minst 8 tecken"; } 
      draw(); return;
    }
    case Screen::Bluetooth:
      if (backHit(x, y)) { go(Screen::Main); return; }
      if (Rect{6, 150, 150, 40}.hit(x, y)) { title(BleBridge::enabled() ? "Stänger av..." : "Startar..."); if (H.setBle) H.setBle(!BleBridge::enabled()); draw(); }
      else if (Rect{164, 150, 150, 40}.hit(x, y) && H.setBleAtBoot) { H.setBleAtBoot(!(H.bleAtBoot && H.bleAtBoot())); draw(); }
      return;
    case Screen::Volume: {
      if (backHit(x, y)) {
        // Persist on leave (one flash write instead of one per press).
        if (H.api && H.getVolume) H.api(true, "/api/runtime", "{\"speaker_volume\":" + String(H.getVolume()) + "}");
        go(Screen::Main); return;
      }
      int v = H.getVolume ? H.getVolume() : 0;
      if (Rect{6, 150, 150, 60}.hit(x, y)) v -= 25; else if (Rect{164, 150, 150, 60}.hit(x, y)) v += 25; else return;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      if (H.setVolume) H.setVolume(static_cast<uint8_t>(v));
      draw(); return;
    }
    case Screen::Info: if (backHit(x, y)) go(Screen::Main); return;
    case Screen::Message: return;
  }
}
}  // namespace

namespace TouchMenu {
void begin(const Hooks& hooks) { H = hooks; }
bool active() { return g_active; }
void open() {
  if (g_active) return;
  if (H.onOpen) H.onOpen();
  ScreenImage::clear();
  g_active = true; g_lastTouch = millis(); g_wasPressed = true; g_px0 = -1;  // ignore the opening hold's release
  Serial.println("Menu: opened");
  go(Screen::Main);
}
bool loop(bool pressed, int x, int y) {
  if (!g_active) return false;
  uint32_t now = millis();
  if (g_screen == Screen::Main) {
    if (pressed) {
      if (!g_wasPressed) { g_lastTouch = now; g_px0 = x; g_py0 = y; }
      if (g_px0 >= 0) { g_px1 = x; g_py1 = y; }
    } else if (g_wasPressed && g_px0 >= 0) {
      g_lastTouch = now;
      const int x0 = g_px0, y0 = g_py0; g_px0 = -1;
      const auto g = MenuPagerPolicy::classify(x0, y0, g_px1, g_py1);
      if (g == MenuPagerPolicy::Gesture::Tap) tap(x0, y0);
      else if (g == MenuPagerPolicy::Gesture::Close) close();
      else if (g != MenuPagerPolicy::Gesture::None) { g_menuPage = MenuPagerPolicy::step(g_menuPage, menuPages(), g); g_appMsg = ""; draw(); }
    }
  } else if (pressed && !g_wasPressed) { g_lastTouch = now; tap(x, y); }
  g_wasPressed = pressed;
  if (g_active && g_screen == Screen::Bluetooth) {
    static uint32_t last = 0; static bool lastConn = false;
    if (BleBridge::connected() != lastConn && now - last > 300) { lastConn = BleBridge::connected(); last = now; draw(); }
  }
  if (g_active && g_screen != Screen::Message && now - g_lastTouch > kIdleCloseMs) close();
  return true;
}
}  // namespace TouchMenu
