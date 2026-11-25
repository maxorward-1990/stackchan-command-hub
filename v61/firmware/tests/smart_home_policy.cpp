#include "../src/SmartHomePolicy.h"
#include <cassert>
#include <cstdio>
using namespace SmartHomePolicy;
int main() {
  assert(stringToSign("GET", emptyBodySha256, "/v1.0/token?grant_type=1") ==
         std::string("GET\n") + emptyBodySha256 + "\n\n/v1.0/token?grant_type=1");
  assert(signPayload("cid", "", "1700000000000", "", "S") == "cid1700000000000S");
  assert(signPayload("cid", "tok", "1", "n", "S") == "cidtok1nS");
  assert(validClientId("wrf5kxxeewp8qw5a9ywv") && !validClientId("short") && !validClientId("wrf5kxxeewp8qw5a9yw!"));
  assert(validClientSecret(std::string(32, 'a')) && !validClientSecret("abc"));
  assert(normalize("Living Room  Table!") == "living room table");
  assert(normalize("Släck KÖKET") == "slack koket");

  std::vector<Device> d = {
    {"a", "Living Room Table", "dj"}, {"b", "Living Room Desk Light", "dj"}, {"c", "Kitchen LED", "dd"},
    {"d", "Kitchen Corner", "dj"}, {"e", "Outdoor Remote Socket GP120", "cz"}, {"f", "Living Room Reading Light", "dj"},
  };
  assert(selectTargets(d, "Living Room Table").size() == 1);           // exact name only
  assert(selectTargets(d, "living room").size() == 3);
  assert(selectTargets(d, "kitchen lights").size() == 2);
  assert(selectTargets(d, "all").size() == 6);                          // everything incl. sockets
  assert(selectTargets(d, "alla lamporna").size() == 5);                // lights only
  assert(selectTargets(d, "lights").size() == 5);
  assert(selectTargets(d, "garage").empty());
  assert(selectTargets(d, "").empty());
  assert(selectTargets(d, "outdoor").size() == 1);

  assert(std::string(switchCode("dj")) == "switch_led" && std::string(switchCode("cz")) == "switch_1");
  assert(std::string(switchCode("cz", true)) == "switch_led");
  assert(commandBody("on", "dj", 0, "") == "{\"commands\":[{\"code\":\"switch_led\",\"value\":true}]}");
  assert(commandBody("off", "cz", 0, "") == "{\"commands\":[{\"code\":\"switch_1\",\"value\":false}]}");
  assert(commandBody("brightness", "cz", 50, "").empty());            // sockets cannot dim
  assert(commandBody("brightness", "dj", 0, "").empty());
  assert(brightnessValue(1) == 10 && brightnessValue(100) == 1000 && brightnessValue(50) == 500);
  assert(commandBody("brightness", "dj", 100, "").find("\"bright_value_v2\",\"value\":1000") != std::string::npos);
  assert(commandBody("color", "dj", 0, "blå").find("\"h\":240,\"s\":1000,\"v\":1000") != std::string::npos);
  assert(commandBody("color", "dj", 0, "magenta-ish").empty());
  assert(hueFor("Röd") == 0 && hueFor("grön") == 120);
  assert(validAction("list") && validAction("scene") && !validAction("toggle"));
  {
    std::vector<Device> h = {{"a","Bedroom LED","dd"},{"b","Work LED","dd"},{"c","Hallway Switch","cz"},{"d","Work Room Switch","cz"},{"e","Kitchen Corner","dj"}};
    assert(selectTargetsMulti(h, "led-lamporna switch").size() == 4);   // the failing v43 request
    assert(selectTargetsMulti(h, "Bedroom LED, Hallway Switch").size() == 2);
    assert(selectTargetsMulti(h, "kitchen och hallway").size() == 2);
    assert(selectTargetsMulti(h, "led garage").empty());               // unknown word: nothing
    assert(selectTargetsMulti(h, "Work LED").size() == 1);             // strict still wins
    assert(selectTargetsMulti(h, "work").size() == 2);
    std::vector<Scene> sc;
    for (const char* n : {"Kvällsmys", "Släck allt", "God natt"}) assert(upsertScene(sc, {n, {{"Work LED", "off", "", 0}}}).empty());
    assert(selectScene(sc, "släck allt") == 1);
    assert(selectScene(sc, "kvallsmys scenen") == 0);
    assert(selectScene(sc, "god") == 2);
    assert(selectScene(sc, "disco") == -1 && selectScene(sc, "") == -1);
    assert(selectScene(sc, "kör kvällsmys") == 0);
    assert(selectScene(sc, "scenen") == -1);                           // filler only matches nothing
    // local scene validation and storage rules
    assert(sceneError({"Mys", {{"Work LED", "brightness", "", 30}, {"Kitchen LED", "color", "blå", 0}}}).empty());
    assert(sceneError({"", {{"Work LED", "on", "", 0}}}) == "scene_name_missing");
    assert(sceneError({"Mys", {}}) == "scene_has_no_devices");
    assert(sceneError({"Mys", {{"Work LED", "brightness", "", 0}}}) == "scene_brightness_invalid");
    assert(sceneError({"Mys", {{"Work LED", "brightness", "", 101}}}) == "scene_brightness_invalid");
    assert(sceneError({"Mys", {{"Work LED", "color", "magenta-ish", 0}}}) == "scene_color_invalid");
    assert(sceneError({"Mys", {{"Work LED", "toggle", "", 0}}}) == "scene_action_invalid");
    assert(sceneError({std::string(41, 'a'), {{"Work LED", "on", "", 0}}}) == "scene_name_too_long");
    Scene big{"Stor", {}}; for (int i = 0; i < 17; ++i) big.steps.push_back({"Work LED", "on", "", 0});
    assert(sceneError(big) == "scene_too_many_devices");
    assert(upsertScene(sc, {"god natt", {{"Bedroom LED", "off", "", 0}}}).empty() && sc.size() == 3);  // replaces
    assert(sc[2].steps[0].device == "Bedroom LED");
    std::vector<Scene> full; for (int i = 0; i < 20; ++i) assert(upsertScene(full, {"s" + std::to_string(i), {{"x", "on", "", 0}}}).empty());
    assert(upsertScene(full, {"extra", {{"x", "on", "", 0}}}) == "too_many_scenes");
    assert(removeScene(sc, "GOD NATT") && sc.size() == 2 && !removeScene(sc, "disco"));
    assert(deviceIndex(h, "work led") == 1 && deviceIndex(h, "work") == -1);
    assert(retryAfterClockSync(1013) && !retryAfterClockSync(1010));
  }
  assert(std::string(errorForCode(1004)) == "tuya_sign_invalid_check_secret");
  assert(std::string(errorForCode(1106)) == "tuya_permission_denied");
  assert(std::string(errorForCode(0)).empty());
  assert(retryWithAlternateSwitch(2008) && !retryWithAlternateSwitch(1004));
  std::puts("smart_home_policy ok");
}
