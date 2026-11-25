"""Test staged Personality persistence/validation with real ArduinoJson and a fake file."""
from pathlib import Path
import subprocess
import sys
import tempfile

staged = Path(sys.argv[1])
json_include = staged / ".pio/libdeps/m5stack-cores3/ArduinoJson/src"
with tempfile.TemporaryDirectory(prefix="personality-v72-") as tmp:
    d = Path(tmp)
    (d / "Arduino.h").write_text(r'''
#pragma once
#include <string>
#include <cstdio>
class String : public std::string {
public:
  using std::string::string;
  String(const std::string& s) : std::string(s) {}
};
struct FakeSerial { template<class... A> void printf(const char*, A...) {} void println(const char*) {} };
inline FakeSerial Serial;
''')
    (d / "FS.h").write_text(r'''
#pragma once
#include <string>
#include <cstring>
#define FILE_READ "r"
#define FILE_WRITE "w"
inline std::string disk;
inline bool failWrite = false;
class File {
  bool ok; size_t pos = 0;
public:
  File(bool valid=true) : ok(valid) {}
  explicit operator bool() const { return ok; }
  size_t write(uint8_t c) { disk.push_back(static_cast<char>(c)); return 1; }
  size_t write(const uint8_t* b, size_t n) { disk.append(reinterpret_cast<const char*>(b), n); return n; }
  int read() { return pos < disk.size() ? static_cast<unsigned char>(disk[pos++]) : -1; }
  size_t readBytes(char* b, size_t n) { n = std::min(n, disk.size()-pos); std::memcpy(b, disk.data()+pos, n); pos+=n; return n; }
  void close() {}
};
namespace fs { struct FS {
  bool exists(const char*) { return !disk.empty(); }
  File open(const char*, const char* mode) { if (mode[0]=='w') { if(failWrite) return File(false); disk.clear(); } return File(); }
}; }
''')
    (d / "test.cpp").write_text(r'''
#include "Personality.h"
#include <cassert>
int main() {
  fs::FS fs;
  disk=R"({"wake_word":true,"awake_brightness":100})";
  Personality::begin(fs);
  assert(Personality::get().wakeThresholdMilli==490);
  assert(Personality::get().wakeWord && Personality::get().awakeBrightness==100);
  JsonDocument in, out;
  deserializeJson(in,R"({"wake_threshold_milli":585})");
  assert(Personality::update(in.as<JsonVariantConst>()).empty());
  assert(disk.find("\"wake_threshold_milli\":585")!=std::string::npos);
  Personality::toJson(out.to<JsonObject>());
  assert(out["wake_threshold_milli"]==585 && out["wake_min_peak"].isNull());
  deserializeJson(in,R"({"wake_threshold_milli":520})");
  assert(Personality::update(in.as<JsonVariantConst>()).empty());
  disk=R"({"wake_threshold_milli":585,"wake_word":true})";
  Personality::begin(fs); assert(Personality::get().wakeThresholdMilli==585);
  const std::string before=disk;
  for (const char* value : {"449", "751", "490.5", "\"490\"", "true"}) {
    std::string json=std::string("{\"wake_threshold_milli\":")+value+"}";
    deserializeJson(in,json);
    assert(Personality::update(in.as<JsonVariantConst>())=="invalid_wake_threshold");
    assert(Personality::get().wakeThresholdMilli==585 && disk==before);
  }
  failWrite=true; deserializeJson(in,R"({"wake_threshold_milli":490})");
  assert(Personality::update(in.as<JsonVariantConst>())=="save_failed");
  assert(Personality::get().wakeThresholdMilli==585 && disk==before);
}
''')
    subprocess.run(["g++", "-std=c++17", "-I", str(d), "-I", str(json_include), "-I", str(staged / "src"), str(d / "test.cpp"), str(staged / "src/Personality.cpp"), "-o", str(d / "test")], check=True)
    subprocess.run([str(d / "test")], check=True)
print("v72 Personality: legacy load, saved threshold readback/reload, invalid values and failed-save rollback passed")