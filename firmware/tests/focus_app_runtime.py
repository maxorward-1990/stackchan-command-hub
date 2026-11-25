"""Compile the actual focus-timer handler with host fakes; no hardware claims."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
json_include = Path(sys.argv[1])
with tempfile.TemporaryDirectory(prefix="focus-app-runtime-") as directory:
    tmp = Path(directory)
    (tmp / "Arduino.h").write_text("#pragma once\n#include <cstdint>\n#include <cstdio>\ninline uint32_t testMillis=100;\ninline uint32_t millis(){return testMillis;}\nstruct FakeSerial{template<class...A> void printf(const char*,A...){} void println(const char*){} };\ninline FakeSerial Serial;\n")
    (tmp / "M5GFX.h").write_text(r'''
#pragma once
#include <cstdint>
#include <cstring>
#define TFT_BLACK 0
#define TFT_WHITE 1
#define TFT_GREEN 2
#define TFT_ORANGE 3
#define TFT_DARKGREY 4
namespace fonts { inline int efontJA_16; }
struct M5Canvas {
  void setFont(const int*) {} void setTextSize(int) {}
  int textWidth(const char* s) { return std::strlen(s)*8; }
  int width() { return 320; } int height() { return 240; }
  void setTextColor(uint16_t, uint16_t) {} void setTextWrap(bool) {}
  void setCursor(int,int) {} void print(const char*) {} void fillSprite(int) {}
  void drawFastHLine(int,int,int,int) {} void fillRect(int,int,int,int,int) {} void drawRect(int,int,int,int,int) {}
};
''')
    (tmp / "test.cpp").write_text(r'''
#include "FocusApp.h"
#include <Arduino.h>
#include <cassert>
#include <string>
static std::string disk; static bool failWrite=false;
static bool save(const char* j){ if(failWrite) return false; disk=j; return true; }
static size_t load(char* b,size_t cap){ if(disk.size()>cap) return cap+1; std::memcpy(b,disk.data(),disk.size()); return disk.size(); }
int main() {
 FocusApp::attachStore(save,load);
 JsonDocument in,out; M5Canvas c;
 // Without a saved file the menu starts the 25/5/4 default; touch -/+ steps and persists.
 assert(FocusApp::startSaved(true)==nullptr && FocusApp::running()); FocusApp::stop();
 FocusApp::adjustFocus(1); assert(std::strcmp(FocusApp::summary(),"30/5 min · 4 pass")==0 && disk.find("\"focus_min\":30")!=std::string::npos);
 FocusApp::adjustFocus(-1); FocusApp::adjustFocus(-1); assert(std::strcmp(FocusApp::summary(),"20/5 min · 4 pass")==0);
 // Voice "timer 2 minutes": single countdown widget, starts even mid-conversation, never overwrites saved settings.
 { std::string before=disk; JsonDocument v,o;
   deserializeJson(v,R"({"action":"start","minutes":2})"); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==200);
   assert(FocusApp::simple() && o["kind"]=="timer" && o["mode"]=="widget" && o["remaining_ms"]==120000 && o["rounds"]==1 && disk==before);
   FocusApp::update(true); assert(!FocusApp::widgetVisible() && FocusApp::running());
   FocusApp::update(false); assert(FocusApp::widgetVisible());
   testMillis+=120000; FocusApp::update(false); o.clear(); FocusApp::status(o); assert(o["phase"]=="done");
   deserializeJson(v,R"({"action":"start","minutes":91})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==400);
   deserializeJson(v,R"({"action":"start","minutes":0})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==400);
  deserializeJson(v,R"({"action":"start","seconds":5})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==400);
  deserializeJson(v,R"({"action":"start","seconds":30})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==200 && o["remaining_ms"].as<uint32_t>()<=30000 && o["remaining_ms"].as<uint32_t>()>29000);
  deserializeJson(v,R"({"action":"start","minutes":1,"seconds":30})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==200 && o["remaining_ms"].as<uint32_t>()>89000);
   deserializeJson(v,R"({"action":"stop"})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==200 && !FocusApp::running());
   deserializeJson(v,R"({"action":"pause"})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==400);
   deserializeJson(v,R"({"action":"dance"})"); o.clear(); assert(FocusApp::voice(v.as<JsonVariantConst>(),o)==400); }
 disk.clear(); FocusApp::attachStore(save,load);
 deserializeJson(in,R"({"version":1,"action":"start","focus_min":91,"break_min":5,"rounds":4,"mode":"widget"})");
 assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==400 && !FocusApp::running());
 deserializeJson(in,R"({"version":1,"action":"start","focus_min":2,"break_min":1,"rounds":2,"mode":"fullscreen"})");
 out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,true)==409 && !FocusApp::running());
 out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==200);
 assert(FocusApp::fullscreen() && out["phase"]=="focus" && out["persistent"]==true && out["remaining_ms"]==120000);
 assert(FocusApp::drawFullscreen(c));
 // Voice takes the screen: fullscreen drops to widget, timer keeps running.
 testMillis+=30000; FocusApp::update(true); assert(!FocusApp::fullscreen() && !FocusApp::widgetVisible() && FocusApp::running());
 FocusApp::update(false); assert(FocusApp::widgetVisible());
 out.clear(); FocusApp::status(out); assert(out["remaining_ms"]==90000 && out["mode"]=="widget");
 // Pause and resume via API.
 deserializeJson(in,R"({"action":"pause"})"); out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==200 && out["paused"]==true);
 testMillis+=600000; FocusApp::update(false); out.clear(); FocusApp::status(out); assert(out["remaining_ms"]==90000);
 FocusApp::togglePause(); assert(!FocusApp::paused());
 testMillis+=90000; FocusApp::update(false); out.clear(); FocusApp::status(out); assert(out["phase"]=="break" && out["round"]==1);
 testMillis+=60000+120000; FocusApp::update(false); out.clear(); FocusApp::status(out); assert(out["phase"]=="done");
 testMillis+=60000; FocusApp::update(false); assert(!FocusApp::running());
 // Reboot: saved durations reload, no auto-start; offline start from menu.
 FocusApp::attachStore(save,load); assert(!FocusApp::running());
 assert(FocusApp::startSaved(false)==nullptr && FocusApp::widgetVisible());
 FocusApp::leaveFullscreen(); assert(FocusApp::widgetVisible());
 assert(std::strcmp(FocusApp::summary(),"2/1 min · 2 pass")==0);
 deserializeJson(in,R"({"action":"stop"})"); out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==200 && !FocusApp::running());
 deserializeJson(in,R"({"action":"resume"})"); out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==409);
 // Corrupt file ignored; failed write keeps the running timer but reports not persistent.
 disk="{\"version\":1"; FocusApp::attachStore(save,load); out.clear(); FocusApp::status(out); assert(out["saved"]==false);
 failWrite=true; deserializeJson(in,R"({"version":1,"action":"start","focus_min":25,"break_min":5,"rounds":4,"mode":"widget"})");
 out.clear(); assert(FocusApp::handle(in.as<JsonVariantConst>(),out,false)==200 && FocusApp::running() && out["persistent"]==false);
}
''')
    subprocess.run(["g++", "-std=c++17", "-I", str(tmp), "-I", str(ROOT / "apps"), "-I", str(json_include), str(tmp / "test.cpp"), str(ROOT / "apps/FocusApp.cpp"), "-o", str(tmp / "test")], check=True)
    subprocess.run([str(tmp / "test")], check=True)
print("Actual focus handler: validation, busy rejection, voice yield without stopping, pause/resume, phases, done expiry, saved reboot/offline start, corrupt file and failed write passed")
