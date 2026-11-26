#include "ReplyLanguagePolicy.h"
#include <cassert>
#include <cstring>
int main() {
  using namespace ReplyLanguagePolicy;
  assert(guess("But what's the population of New Hampshire?") == English);
  assert(guess("Perfectly and then I want you to look up how many people live in the state of Arizona.") == English);
  assert(guess("How many people live in Minnesota?") == English);
  assert(guess("Nej, men hur många personer bor i Västergötland?") == Swedish);
  assert(guess("Vem var Olof Palme?") == Swedish);
  assert(guess("") == Unknown && guess(nullptr) == Unknown && guess("6") == Unknown);
  assert(strstr(instruction(English), "English") && strstr(instruction(Swedish), "Swedish") && !instruction(Unknown));
}
