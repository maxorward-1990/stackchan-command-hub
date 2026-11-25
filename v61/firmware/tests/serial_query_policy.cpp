#include "../src/SerialQueryPolicy.h"
#include <cassert>
using namespace SerialQueryPolicy;
int main() {
  auto s = split("/api/sensors?audio=1");
  assert(s.path == "/api/sensors" && s.query == "audio=1" && s.ok);
  assert(split("/api/status").path == "/api/status" && split("/api/status").query.empty());
  std::string v;
  assert(get("audio=1", "audio", &v) && v == "1");
  assert(get("pretty&audio", "audio", &v) && v.empty());
  assert(!get("audio_direction=1", "audio"));
  assert(get("a=1&q=hej%20d%C3%A5+du", "q", &v) && v == "hej d\xC3\xA5 du");
  assert(!get("", "audio"));
  assert(!split("/x?" + std::string(300, 'a')).ok);
  return 0;
}
