#include "../src/TodoPolicy.h"
#include <cassert>
using namespace TodoPolicy;
int main() {
  std::vector<Item> v;
  uint32_t id = 0;
  assert(add(v, "  Ring tandläkaren \n", &id) == Result::Ok && id == 1);
  assert(v[0].text == "Ring tandläkaren");
  assert(add(v, "   ") == Result::Empty);
  assert(add(v, std::string(300, 'a')) == Result::Ok && v[1].text.size() == kMaxText);
  std::string long_utf8; for (int i = 0; i < 100; ++i) long_utf8 += "\xC3\xA5";  // 200 bytes of "å"
  assert(add(v, long_utf8) == Result::Ok && v[2].text.size() == kMaxText && v[2].text.size() % 2 == 0);
  assert(complete(v, 0, "RING") == Result::Ok && v[0].done);
  assert(complete(v, 99, "") == Result::NotFound);
  assert(remove(v, 2, "") == Result::Ok && v.size() == 2);
  assert(clearDone(v) == 1 && v.size() == 1);
  while (v.size() < kMaxItems) add(v, "x");
  assert(add(v, "one too many") == Result::Full);
  assert(nextId(v) > v.back().id);
}
