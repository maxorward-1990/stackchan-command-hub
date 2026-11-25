#include "../src/GestureAliasPolicy.h"
#include <cassert>
#include <string>
using namespace GestureAliasPolicy;
int main() {
  assert(std::string(resolve("nod_yes")) == "nod_yes");
  assert(std::string(resolve("little_dance")) == "little_dance");
  assert(std::string(resolve("calculation_motion")) == "curious_tilt");  // seen in v57 log
  assert(std::string(resolve("thinking")) == "curious_tilt");
  assert(std::string(resolve("")) == "curious_tilt");
  assert(std::string(resolve("Nod_Agree")) == "nod_yes");
  assert(std::string(resolve("happy_dance")) == "little_dance");
  assert(std::string(resolve("glance_left")) == "look_left_small");
  assert(std::string(resolve("emergency_stop")) == "stop_motion");
  assert(known("shake_no") && !known("calculation_motion"));
  for (const char* k : kKnown) assert(std::string(resolve(k)) == k);
  return 0;
}
