#include "../src/InternetPolicy.h"
#include <cassert>
int main() {
  assert(InternetPolicy::allowedUrl("https://sv.wikipedia.org/w/api.php"));
  assert(InternetPolicy::allowedUrl("https://thumb.wikimedia.org/wikipedia/commons/a.jpg"));
  assert(!InternetPolicy::allowedUrl("http://sv.wikipedia.org/w/api.php"));
  assert(!InternetPolicy::allowedUrl("https://sv.wikipedia.org.attacker.org/a"));
  assert(!InternetPolicy::allowedUrl("https://upload.wikimedia.org@192.168.0.1/a"));
  assert(!InternetPolicy::allowedUrl("https://192.168.0.188/a"));
  assert(!InternetPolicy::allowedUrl("https://sv.wikipedia.org/a\r\nHost: bad"));
  assert(InternetPolicy::encode("sten & berg") == "sten%20%26%20berg");
  assert(InternetPolicy::encode("å") == "%C3%A5");
  assert(InternetPolicy::maxBytes == 65536);
}