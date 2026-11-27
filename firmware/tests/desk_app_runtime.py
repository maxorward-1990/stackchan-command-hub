"""Compile the actual clock-app handler with host fakes; no hardware claims."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
json_include = Path(sys.argv[1])
with tempfile.TemporaryDirectory(prefix="desk-app-runtime-") as directory:
    tmp = Path(directory)
    (tmp / "Arduino.h").write_text("#pragma once\n#include <cstdint>\ninline uint32_t testMillis=100;\ninline uint32_t millis(){return testMillis;}\n")
    (tmp / "M5GFX.h").write_text(r'''
#pragma once
#include <cstdint>
#include <cstring>
#define TFT_BLACK 0
#define TFT_WHITE 1
#define TFT_CYAN 2
#define TFT_DARKCYAN 3
namespace fonts { inline int efontJA_16; }
struct M5Canvas {
  void setFont(const int*) {} void setTextSize(int) {}
  int textWidth(const char* s) { return std::strlen(s)*8; }
  int width() { return 320; } int height() { return 240; }
  void setTextColor(uint16_t, uint16_t) {} void setTextWrap(bool) {}
  void setCursor(int,int) {} void print(const char*) {} void fillSprite(int) {}
  void drawFastHLine(int,int,int,int) {} void fillRect(int,int,int,int,int) {}
};
''')
    (tmp / "test.cpp").write_text(r'''
#include "DeskApp.h"
#include <Arduino.h>
#include <cassert>
#include <string>
static std::string disk; static bool failWrite=false;
static bool save(const char* j){ if(failWrite) return false; disk=j; return true; }
static size_t load(char* b,size_t cap){ if(disk.size()>cap) return cap+1; std::memcpy(b,disk.data(),disk.size()); return disk.size(); }
int main() {
 DeskApp::attachStore(save,load);
 assert(!DeskApp::hasSaved());
 assert(std::strcmp(DeskApp::startSaved(true,1795536000),"Ingen sparad app")==0);
 JsonDocument in,out;
 deserializeJson(in,R"({"version":1,"action":"start","id":"clock","mode":"fullscreen","seconds":true,"place":"Stockholm","timezone":"Europe/Stockholm","epoch":1795536000,"weather":"4C","weather_ttl_ms":1000})");
 assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==200);
 assert(DeskApp::fullscreen()); assert(out["active"]==true);
 in["timezone"]="America/New_York";
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==400);
 assert(DeskApp::fullscreen()); // Invalid input cannot replace accepted state.
 in["timezone"]="Europe/Stockholm";
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,true)==409);
 assert(DeskApp::fullscreen());
 in["weather_ttl_ms"]=1800001;
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==400);
 in["weather_ttl_ms"]=1000;
 in["version"]=2;
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==400);
 in["version"]=1;
 testMillis=1100; out.clear(); DeskApp::status(out);
 assert(out["weather_remaining_ms"]==0); // Clock continues; forecast has expired.
 DeskApp::update(true); assert(!DeskApp::fullscreen());
 DeskApp::update(false); assert(!DeskApp::fullscreen());
 in["mode"]="widget"; testMillis=2000;
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==200);
 assert(DeskApp::widgetVisible());
 DeskApp::update(true); assert(!DeskApp::widgetVisible());
 out.clear(); DeskApp::status(out); assert(out["active"]==true && out["suspended"]==true);
 DeskApp::update(false); assert(DeskApp::widgetVisible());
 deserializeJson(in,R"({"action":"stop"})");
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,true)==200);
 assert(out["active"]==false && !DeskApp::widgetVisible());
 // Persistence: last accepted start survives a simulated reboot; invalid input never overwrote it.
 assert(disk.find("widget")!=std::string::npos && disk.find("Stockholm")!=std::string::npos);
 DeskApp::attachStore(save,load);
 assert(DeskApp::hasSaved() && std::strcmp(DeskApp::savedPlace(),"Stockholm")==0);
 out.clear(); DeskApp::status(out); assert(out["persistent"]==true && out["active"]==false);
 assert(std::strcmp(DeskApp::startSaved(true,1000),"Klockan ej satt")==0); assert(!DeskApp::fullscreen());
 assert(DeskApp::startSaved(true,1795536000)==nullptr); assert(DeskApp::fullscreen());
 out.clear(); DeskApp::status(out); assert(out["weather_remaining_ms"]==1000); // same second as the saved 1 s forecast
 DeskApp::stopFullscreen();
 // Corrupt or oversized files are ignored, not partially loaded.
 disk="{\"version\":1,\"id\":\"x\""; DeskApp::attachStore(save,load); assert(!DeskApp::hasSaved());
 disk=std::string(600,'a'); DeskApp::attachStore(save,load); assert(!DeskApp::hasSaved());
 // Failed write keeps the running app but reports not persistent.
 disk.clear(); failWrite=true; DeskApp::attachStore(save,load);
 deserializeJson(in,R"({"version":1,"action":"start","id":"clock","mode":"fullscreen","seconds":false,"place":"Tokyo","timezone":"Asia/Tokyo","epoch":1795536000,"weather":"9C","weather_ttl_ms":600000})");
 out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==200);
 assert(DeskApp::fullscreen() && out["persistent"]==false);
 failWrite=false; out.clear(); assert(DeskApp::handle(in.as<JsonVariantConst>(),out,false)==200 && out["persistent"]==true);
 // Weather remains current only for what is left of its wall-clock TTL.
 DeskApp::attachStore(save,load);
 assert(DeskApp::startSaved(false,1795536000+300)==nullptr);
 out.clear(); DeskApp::status(out); assert(out["weather_remaining_ms"]==300000);
 assert(DeskApp::startSaved(false,1795536000+601)==nullptr);
 out.clear(); DeskApp::status(out); assert(out["weather_remaining_ms"]==0 && DeskApp::widgetVisible());
}
''')
    subprocess.run(["g++", "-std=c++17", "-I", str(tmp), "-I", str(ROOT / "src"), "-I", str(json_include), str(tmp / "test.cpp"), str(ROOT / "src/DeskApp.cpp"), "-o", str(tmp / "test")], check=True)
    subprocess.run([str(tmp / "test")], check=True)
print("Actual app handler: start/readback, invalid-input preservation, busy rejection, expiry, widget yield/resume and explicit stop, saved-app reboot/offline start, corrupt-file rejection and weather wall-clock expiry passed")