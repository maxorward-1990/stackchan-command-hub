#include "../src/SerialCommandPolicy.h"
#include <cassert>
using namespace SerialCommandPolicy;
int main() {
  assert(parse("search Sveriges befolkning\r\n").verb == Verb::Search);
  assert(parse("search Sveriges befolkning").arg == "Sveriges befolkning");
  assert(parse("SAY  Googla Sveriges befolkning ").arg == "Googla Sveriges befolkning");
  assert(parse("say").verb == Verb::Unknown);
  assert(parse("search   ").verb == Verb::Unknown);
  assert(parse("mic").verb == Verb::Mic);
  assert(parse("status").verb == Verb::Status);
  assert(parse("   ").verb == Verb::None);
  assert(parse("reboot").verb == Verb::Unknown);
  assert(parse("perf on").verb == Verb::Perf && parse("PERF off").arg == "off");
  assert(parse("perf maybe").verb == Verb::Unknown);
  { auto c = parse("api #7 POST /api/servo/gesture {\"gesture\":\"nod_yes\"}");
    assert(c.verb == Verb::Api && c.id == "7" && c.method == "POST" && c.path == "/api/servo/gesture" && c.body == "{\"gesture\":\"nod_yes\"}"); }
  { auto c = parse("api get /api/runtime"); assert(c.verb == Verb::Api && c.method == "GET" && c.id.empty() && c.body.empty()); }
  assert(parse("api DELETE /api/runtime").verb == Verb::Unknown);
  assert(parse("api GET /etc/passwd").verb == Verb::Unknown);
  assert(parse("api GET").verb == Verb::Unknown);
  assert(parse("api #toolongidentifier GET /api/status").verb == Verb::Unknown);
  return 0;
}
