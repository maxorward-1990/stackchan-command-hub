#include "../src/LiveSessionPolicy.h"
#include <cassert>
int main() {
  JsonDocument doc;
  deserializeJson(doc, R"({"generationComplete":true})");
  assert(!LiveSessionPolicy::turnComplete(doc.as<JsonVariantConst>()));
  doc["turnComplete"] = false;
  assert(!LiveSessionPolicy::turnComplete(doc.as<JsonVariantConst>()));
  doc["turnComplete"] = true;
  assert(LiveSessionPolicy::turnComplete(doc.as<JsonVariantConst>()));
  deserializeJson(doc, R"({"text":"thinking"})");
  assert(!LiveSessionPolicy::audioPart(doc.as<JsonVariantConst>()));
  deserializeJson(doc, R"({"inlineData":{"mimeType":"audio/pcm;rate=24000","data":"AQI="}})");
  assert(LiveSessionPolicy::audioPart(doc.as<JsonVariantConst>()));
  doc["inlineData"]["mimeType"] = "image/jpeg";
  assert(!LiveSessionPolicy::audioPart(doc.as<JsonVariantConst>()));
  assert(!LiveSessionPolicy::captureReady(true, 1));
  assert(LiveSessionPolicy::captureReady(true, 0));
  assert(!LiveSessionPolicy::captureReady(false, 0));
  assert(!LiveSessionPolicy::canResume(false, false, true, false));
  assert(!LiveSessionPolicy::canResume(false, false, false, true));
  assert(!LiveSessionPolicy::canResume(false, true, false, false));
  assert(LiveSessionPolicy::canResume(false, false, false, false));
  assert(!LiveSessionPolicy::expired(29999, 1, 30000));
  assert(LiveSessionPolicy::expired(30001, 1, 30000));
  assert(LiveSessionPolicy::expired(20, UINT32_MAX - 10, 30));
  assert(!LiveSessionPolicy::expired(999999, 0, 30));
  assert(!LiveSessionPolicy::shouldRetryText(true, false, 10999, 1000));
  assert(LiveSessionPolicy::shouldRetryText(true, false, 11000, 1000));
  assert(!LiveSessionPolicy::shouldRetryText(true, true, 50000, 1000));
  assert(!LiveSessionPolicy::shouldRetryText(false, false, 50000, 1000));
  // v65: manual voice turns time out at 10 s, text turns keep 30 s.
  assert(LiveSessionPolicy::replyDeadline(true) == 10000);
  assert(LiveSessionPolicy::replyDeadline(false) == 30000);
}
