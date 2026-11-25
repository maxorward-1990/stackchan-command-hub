#include "ScreenImage.h"
#include "DisplayPolicy.h"
#include <M5StackChan.h>
#include <vector>
namespace ScreenImage {
static uint32_t until = 0;
static uint32_t panelUntil = 0, panelStarted = 0;
static std::vector<String> panel;
bool active() { return until && static_cast<int32_t>(until - millis()) > 0; }
bool hasPanel() { return panelUntil && static_cast<int32_t>(panelUntil - millis()) > 0 && !panel.empty(); }
void clear() { until = panelUntil = 0; panel.clear(); }
void drawPanel(M5Canvas& canvas) {
 if (!hasPanel()) return;
 int top = canvas.height() - DisplayPolicy::panelHeight;
 canvas.fillRect(0, top, canvas.width(), DisplayPolicy::panelHeight, TFT_BLACK);
 canvas.drawFastHLine(8, top, canvas.width()-16, TFT_DARKCYAN);
 canvas.setFont(&fonts::efontJA_16); canvas.setTextSize(1);
 canvas.setTextColor(TFT_WHITE, TFT_BLACK); canvas.setTextWrap(false);
 size_t page = DisplayPolicy::pageIndex(millis() - panelStarted, panel.size());
 size_t first = page * DisplayPolicy::panelLines;
 for (size_t i = 0; i < DisplayPolicy::panelLines && first + i < panel.size(); ++i) {
   canvas.setCursor(8, top + 4 + i * 17); canvas.print(panel[first+i]);
 }
 size_t pages = (panel.size() + DisplayPolicy::panelLines - 1) / DisplayPolicy::panelLines;
 if (pages > 1) {
   canvas.setFont(&fonts::Font0); canvas.setCursor(canvas.width()-40, canvas.height()-10);
   canvas.printf("%u/%u", static_cast<unsigned>(page+1), static_cast<unsigned>(pages));
 }
}
bool showJpeg(const uint8_t* bytes, size_t size) {
 if (!bytes || size < 4 || size > 65536 || bytes[0] != 255 || bytes[1] != 216) return false;
 clear();
 auto& d = M5StackChan.Display();
 d.wakeup(); d.fillScreen(TFT_BLACK);
 bool ok = d.drawJpg(bytes, size, 0, 0, d.width(), d.height(), 0, 0, 0.0f, 0.0f, datum_t::middle_center);
 until = ok ? millis() + 20000 : 0;
 return ok;
}
bool showInformation(JsonVariantConst content) {
 String type = content["type"] | "";
 if (type == "clear") { clear(); return true; }
 String title = content["title"] | "";
 String text = content["text"] | "";
 auto items = content["items"].as<JsonArrayConst>();
 if (title.length() > DisplayPolicy::maxTitle) return false;
 if (type == "text") {
   if (!DisplayPolicy::textFits(title.length(), text.length())) return false;
 } else if (type == "list" || type == "bars") {
   if (items.size() == 0 || items.size() > DisplayPolicy::maxItems) return false;
   for (auto item : items) {
     String label = item["label"] | "";
     if (label.isEmpty() || label.length() > 80) return false;
     if (type == "bars" && (!item["value"].is<double>() || !DisplayPolicy::barValue(item["value"].as<double>()))) return false;
     text += (text.length() ? "\n" : "") + label;
   }
 } else return false;
 auto& d = M5StackChan.Display();
 if (type == "text" || type == "list") {
   // Validate and wrap every UTF-8 glyph BEFORE changing the display. All
   // accepted content is retained in paged bottom panels, never truncated.
   d.setFont(&fonts::efontJA_16); d.setTextSize(1);
   String input = title.length() ? title + "\n" + text : text;
   std::vector<String> nextLines; String line;
   for (size_t i = 0; i < input.length();) {
     uint8_t c = input[i]; size_t n = c < 0x80 ? 1 : (c < 0xE0 ? 2 : (c < 0xF0 ? 3 : 4));
     if (i+n > input.length()) return false;
     String next = input.substring(i, i+n); i += n;
     if (next == "\n" || d.textWidth(line+next) > d.width()-16) {
       nextLines.push_back(line); line = "";
       if (nextLines.size() >= DisplayPolicy::maxPanelLines) return false;
       if (next == "\n") continue;
     }
     line += next;
   }
   if (line.length()) nextLines.push_back(line);
   if (nextLines.empty() || nextLines.size() > DisplayPolicy::maxPanelLines) return false;
   clear(); panel = std::move(nextLines); panelStarted = millis();
   size_t pages = (panel.size()+DisplayPolicy::panelLines-1)/DisplayPolicy::panelLines;
   panelUntil = millis() + max(static_cast<uint32_t>(60000), static_cast<uint32_t>(pages * DisplayPolicy::pageMs));
   d.wakeup(); return true;
 }
 clear();
 d.wakeup(); d.fillScreen(TFT_BLACK);
 d.setFont(&fonts::efontJA_16); d.setTextSize(1); d.setTextColor(TFT_WHITE, TFT_BLACK);
 d.setTextWrap(false); d.setCursor(8, 8);
 // Wrap at UTF-8 boundaries using the actual font width. Long content is
 // rejected rather than silently hidden beyond the small LCD.
 auto wrap = [&](const String& input, int y, int limit) {
   String line;
   for (size_t i = 0; i < input.length();) {
     uint8_t c = input[i]; size_t n = c < 0x80 ? 1 : (c < 0xE0 ? 2 : (c < 0xF0 ? 3 : 4));
     if (i + n > input.length()) return -1;
     String next = input.substring(i, i+n); i += n;
     if (next == "\n" || d.textWidth(line + next) > d.width()-16) {
       if (y+16 > limit) return -1;
       d.setCursor(8,y); d.print(line); y += 18; line = "";
       if (next == "\n") continue;
     }
     line += next;
   }
   if (line.length()) { if (y+16 > limit) return -1; d.setCursor(8,y); d.print(line); y += 18; }
   return y;
 };
 int y = wrap(title, 8, 48);
 if (y < 0) { clear(); return false; }
 y += 8;
 if (type == "bars") {
   for (auto item : items) {
     String label = item["label"] | "";
     label += " " + String(item["value"].as<double>(), 1) + "%";
     y = wrap(label, y, d.height()-18);
     if (y < 0 || y+12 > d.height()-4) { clear(); return false; }
     d.drawRect(8,y,d.width()-16,8,TFT_WHITE);
     d.fillRect(9,y+1,static_cast<int>((d.width()-18)*item["value"].as<double>()/100),6,TFT_GREEN);
     y += 16;
   }
 } else if (wrap(text, y, d.height()-8) < 0) { clear(); return false; }
 until = millis() + 60000;
 return true;
}
}
