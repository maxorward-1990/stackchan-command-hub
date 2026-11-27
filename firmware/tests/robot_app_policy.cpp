#include "../src/RobotAppPlayer.h"
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>
using namespace RobotAppPolicy;

static const char* kDisco = R"({"id":"disco-1","name":"Disco","enabled":true,"cooldown_s":10,
 "triggers":[{"kind":"button"},{"kind":"says","phrase":"Disco"},{"kind":"near","threshold":100},{"kind":"time","at":"07:30","days":[1,2,3,4,5]}],
 "actions":[{"kind":"led","mode":"solid","color":"#00ff40"},{"kind":"speak","text":"Disco!"},{"kind":"gesture","gesture":"little_dance"},
            {"kind":"wait","seconds":2},{"kind":"image","name":"a.jpg","file":"disco-1_4.jpg"},{"kind":"lights","action":"scene","target":"Mys"},{"kind":"reset"}]})";

struct FakeEnv : RobotAppPlayer::Env {
  uint32_t t = 0; std::vector<std::string> calls;
  bool speakingNow = false, motion = false, failGesture = false, idle = false; int lights = 0;
  uint32_t now() override { return t; }
  bool led(const char* m, uint8_t r, uint8_t g, uint8_t b) override { char s[64]; std::snprintf(s, sizeof s, "led %s %d %d %d", m, r, g, b); calls.push_back(s); return true; }
  bool emotion(const char* n) override { calls.push_back(std::string("emotion ") + n); return true; }
  bool gesture(const char* n) override { calls.push_back(std::string("gesture ") + n); motion = true; return !failGesture; }
  bool look(int x, int y) override { calls.push_back("look " + std::to_string(x) + " " + std::to_string(y)); return true; }
  bool motionBusy() override { return motion; }
  bool showText(const char* s) override { calls.push_back(std::string("text ") + s); return true; }
  bool showImage(const char* f) override { calls.push_back(std::string("image ") + f); return true; }
  void clearScreen() override { calls.push_back("clear"); }
  bool requestText(const char* s) override { calls.push_back(std::string("say ") + s); return true; }
  bool speaking() override { return speakingNow; }
  bool speechIdle() override { return idle; }
  bool lightsStart(const char* a, const char* tg) override { calls.push_back(std::string("lights ") + a + " " + tg); return true; }
  int lightsPoll() override { return lights; }
  bool todoAdd(const char* s) override { calls.push_back(std::string("todo ") + s); return true; }
  bool timerStart(int m) override { calls.push_back("timer " + std::to_string(m)); return true; }
  void stopTalk() override { calls.push_back("stop"); }
  void resetLook() override { calls.push_back("reset"); }
  bool convo = false; int convoStarts = 0;
  bool takePhoto(bool show) override { calls.push_back(std::string("photo ") + (show ? "show" : "keep")); return true; }
  bool startConversation() override { calls.push_back("listen"); ++convoStarts; return true; }
  bool conversationActive() override { return convo; }
  uint32_t playSound(const char* n) override { calls.push_back(std::string("sound ") + n); return 600; }
};
static void run(RobotAppPlayer::Player& p, FakeEnv& e, uint32_t ms, uint32_t step = 100) { for (uint32_t i = 0; i < ms; i += step) { p.tick(e); e.t += step; } }

int main() {
  JsonDocument doc; deserializeJson(doc, kDisco);
  assert(validate(doc.as<JsonVariantConst>()) == nullptr);
  AppMeta m; assert(readMeta(doc.as<JsonVariantConst>(), m));
  assert(!std::strcmp(m.name, "Disco") && m.triggerCount == 4 && m.steps == 7 && m.images == 1 && m.cooldown == 10);
  assert(m.t[3].kind == Trig::Time && m.t[3].hh == 7 && m.t[3].mm == 30 && m.t[3].days == 0b0111110);

  // Validation rejects anything outside the format.
  auto bad = [&](const char* path, const char* json) { JsonDocument d; deserializeJson(d, kDisco); JsonDocument patch; deserializeJson(patch, json); d[path] = patch.as<JsonVariantConst>(); return validate(d.as<JsonVariantConst>()) != nullptr; };
  assert(bad("id", "\"../etc\"") && bad("name", "\"   \"") && bad("cooldown_s", "4000") && bad("triggers", "[]"));
  assert(bad("triggers", R"([{"kind":"time","at":"24:00","days":[1]}])") && bad("triggers", R"([{"kind":"script"}])"));
  assert(bad("actions", R"([{"kind":"gesture","gesture":"self_destruct"}])") && bad("actions", R"([{"kind":"image","name":"","file":"other_0.jpg"}])"));
  assert(bad("actions", R"([{"kind":"led","mode":"solid","color":"red"}])") && bad("actions", R"([{"kind":"wait","seconds":61}])"));
  { JsonDocument d; deserializeJson(d, kDisco); JsonArray a = d["actions"]; a.clear(); for (int i = 0; i < 21; ++i) a.add<JsonObject>()["kind"] = "clear"; assert(validate(d.as<JsonVariantConst>())); }
  { JsonDocument d; deserializeJson(d, kDisco); JsonArray a = d["actions"]; a.clear(); for (int i = 0; i < 7; ++i) { auto s = a.add<JsonObject>(); s["kind"] = "image"; s["name"] = ""; char f[64]; imageFile("disco-1", i, f, sizeof f); s["file"] = f; } assert(!std::strcmp(validate(d.as<JsonVariantConst>()), "too_many_images")); }

  // File names map to an app id; nothing else is accepted.
  char id[64];
  assert(parseFileName("disco-1.json", id, sizeof id) == FileKind::Json && !std::strcmp(id, "disco-1"));
  assert(parseFileName("disco-1_4.jpg", id, sizeof id) == FileKind::Image && !std::strcmp(id, "disco-1"));
  assert(parseFileName("../x.json", id, sizeof id) == FileKind::Invalid && parseFileName("a_04.jpg", id, sizeof id) == FileKind::Invalid);
  assert(parseFileName("a_20.jpg", id, sizeof id) == FileKind::Invalid && parseFileName("a.txt", id, sizeof id) == FileKind::Invalid);

  // Speech matching: whole words, Swedish letters case-folded.
  assert(saysMatch("Disco", "Kör disco nu!") && saysMatch("disco", "DISCO.") && !saysMatch("disco", "vi går på discotek"));
  assert(saysMatch("god natt", "God natt, Stackchan") && saysMatch("ÖPPNA", "öppna lådan") && !saysMatch("", "allt"));
  UtteranceJoiner j;
  const char* u = j.push("Kör", 0); uint32_t first = j.id; u = j.push(" disco", 800); assert(!std::strcmp(u, "Kör disco") && j.id == first);
  j.push("Hej", 5000); assert(j.id == first + 1);
  AppMeta apps[2]; apps[0] = m; std::snprintf(apps[1].name, sizeof apps[1].name, "God natt");
  assert(findByName(apps, 2, "disco") == 0 && findByName(apps, 2, "appen god natt") == 1 && findByName(apps, 2, "fisk") == -1);

  // Edges fire once and never from an unknown baseline; time and cooldown.
  Edge e; assert(!e.update(true, true) && !e.update(true, true));
  Edge n; assert(!n.update(true, false) && n.update(true, true) && !n.update(true, true) && !n.update(false, false) && !n.update(true, true));
  assert(sensorActive(m.t[2], 150, 0) && !sensorActive(m.t[2], 50, 0));
  TriggerMeta dark; dark.kind = Trig::Light; dark.dark = true; dark.threshold = 20; assert(sensorActive(dark, 0, 5) && !sensorActive(dark, 0, 300));
  assert(timeMatches(m.t[3], 7, 30, 1) && !timeMatches(m.t[3], 7, 30, 6) && !timeMatches(m.t[3], 7, 31, 1));
  assert(mayStart(10, false, 0, 0) && !mayStart(10, true, 0, 9999) && mayStart(10, true, 0, 10000));

  // Player: full run in order, waits for speech/motion/time/lights.
  FakeEnv env; RobotAppPlayer::Player p;
  p.start(doc["actions"].as<JsonArrayConst>(), "Disco");
  run(p, env, 300);
  assert(env.calls.size() == 2 && env.calls[0] == "led solid 0 255 64" && env.calls[1].find("Disco!") != std::string::npos);
  env.speakingNow = true; run(p, env, 3000);
  env.speakingNow = false; run(p, env, 1000); assert(env.calls.size() == 2);  // quiet < 1.5 s: still waiting
  run(p, env, 700); assert(env.calls.back() == "gesture little_dance");
  run(p, env, 2000); assert(env.calls.back() == "gesture little_dance");  // dance still moving
  env.motion = false; run(p, env, 1900); assert(env.calls.back() == "gesture little_dance");  // the 2 s wait
  run(p, env, 800); assert(env.calls[env.calls.size() - 2] == "image disco-1_4.jpg" && env.calls.back() == "lights scene Mys");
  env.lights = 1; run(p, env, 500); assert(env.calls.back() == "reset" && !p.running() && !*p.error());

  // Failures stop the run with the step number; never-starting speech times out.
  FakeEnv e2; e2.failGesture = true; RobotAppPlayer::Player p2; p2.start(doc["actions"].as<JsonArrayConst>(), "Disco");
  run(p2, e2, 25000); assert(!p2.running() && std::string(p2.error()).find("Steg 2 (speak)") == 0);
  FakeEnv e3; e3.lights = -1; JsonDocument l; deserializeJson(l, R"([{"kind":"lights","action":"off","target":"Kök"},{"kind":"clear"}])");
  RobotAppPlayer::Player p3; p3.start(l.as<JsonArrayConst>(), "x"); run(p3, e3, 500); assert(!p3.running() && std::string(p3.error()).find("Steg 1") == 0 && e3.calls.size() == 1);
  JsonDocument lk; deserializeJson(lk, R"([{"kind":"look","pan":-90,"tilt":30},{"kind":"stop_talk"}])");
  FakeEnv e4; RobotAppPlayer::Player p4; p4.start(lk.as<JsonArrayConst>(), "x"); run(p4, e4, 1000);
  assert(e4.calls[0] == "look -1280 900" && e4.calls[1] == "stop" && !p4.running());
  RobotAppPlayer::Player p5; FakeEnv e5; p5.start(doc["actions"].as<JsonArrayConst>(), "Disco"); run(p5, e5, 300); p5.stop(); assert(!p5.running() && !std::strcmp(p5.error(), "Stoppad."));
  // A turn that ends without audio is retried once, then the app stops with a clear error.
  JsonDocument sp; deserializeJson(sp, R"([{"kind":"speak","text":"Disco!"},{"kind":"clear"}])");
  FakeEnv e6; RobotAppPlayer::Player p6; p6.start(sp.as<JsonArrayConst>(), "x");
  run(p6, e6, 500); assert(e6.calls.size() == 1);   // connecting: not idle yet
  e6.idle = true; run(p6, e6, 1400); assert(e6.calls.size() == 1);
  run(p6, e6, 300); assert(e6.calls.size() == 2 && e6.calls[1] == e6.calls[0]);  // retried with the same text
  e6.idle = false; e6.speakingNow = true; run(p6, e6, 1000); e6.speakingNow = false; e6.idle = true; run(p6, e6, 2000);
  assert(e6.calls.back() == "clear" && !p6.running() && !*p6.error());
  FakeEnv e7; e7.idle = true; RobotAppPlayer::Player p7; p7.start(sp.as<JsonArrayConst>(), "x"); run(p7, e7, 5000);
  assert(!p7.running() && std::string(p7.error()).find("utan ljud") != std::string::npos && e7.calls.size() == 2);
  // v87 groups: "with_previous" starts together; motion waits for the robot to start talking.
  JsonDocument g; deserializeJson(g, R"({"id":"g","name":"Hej","enabled":true,"cooldown_s":0,"triggers":[{"kind":"lifted"},{"kind":"power_on"}],
    "actions":[{"kind":"emotion","emotion":"neutral"},{"kind":"led","mode":"rainbow","color":"#000000","with_previous":true},
               {"kind":"speak","text":"Hej"},{"kind":"gesture","gesture":"little_dance","with_previous":true},
               {"kind":"sound","sound":"double"},{"kind":"photo","show":true,"with_previous":true},{"kind":"listen"},{"kind":"describe","prompt":"Vad ser du?"}]})");
  assert(validate(g.as<JsonVariantConst>()) == nullptr);
  AppMeta gm; assert(readMeta(g.as<JsonVariantConst>(), gm) && gm.t[0].kind == Trig::Lifted && gm.t[1].kind == Trig::PowerOn);
  FakeEnv e8; RobotAppPlayer::Player p8; p8.start(g["actions"].as<JsonArrayConst>(), "Hej");
  run(p8, e8, 100); assert(e8.calls.size() == 2 && e8.calls[0] == "emotion neutral" && e8.calls[1].rfind("led rainbow", 0) == 0);  // one group, same tick
  run(p8, e8, 200); assert(e8.calls.size() == 3 && e8.calls[2].find("Anropa inga verktyg") != std::string::npos);  // speech, dance deferred
  run(p8, e8, 1000); assert(e8.calls.size() == 3);                       // connecting: no dance yet
  e8.speakingNow = true; run(p8, e8, 200); assert(e8.calls.back() == "gesture little_dance");  // dance starts with the words
  run(p8, e8, 2000); e8.speakingNow = false; e8.motion = false; run(p8, e8, 1700);
  assert(e8.calls[4] == "sound double" && e8.calls[5] == "photo show");    // next group: both at once
  run(p8, e8, 700); assert(e8.calls.back() == "listen");
  run(p8, e8, 3000); assert(p8.running() && e8.calls.back() == "listen");    // waits for the conversation to start
  e8.convo = true; run(p8, e8, 1000); e8.convo = false; run(p8, e8, 300);
  assert(e8.calls.back().find("look_with_camera") != std::string::npos);
  FakeEnv e9; e9.idle = false; RobotAppPlayer::Player p9; JsonDocument lst; deserializeJson(lst, R"([{"kind":"listen"}])");
  p9.start(lst.as<JsonArrayConst>(), "x"); run(p9, e9, 11000); assert(!p9.running() && std::string(p9.error()).find("samtalet startade inte") != std::string::npos);
  // Group rules: one head, one voice, one screen per group.
  auto conflict = [](const char* actions) { JsonDocument d; deserializeJson(d, kDisco); JsonDocument a; deserializeJson(a, actions); d["actions"] = a.as<JsonVariantConst>(); const char* e = validate(d.as<JsonVariantConst>()); return e && !std::strcmp(e, "group_conflict"); };
  assert(conflict(R"([{"kind":"gesture","gesture":"nod_yes"},{"kind":"look","pan":0,"tilt":0,"with_previous":true}])"));
  assert(conflict(R"([{"kind":"speak","text":"a"},{"kind":"listen","with_previous":true}])"));
  assert(conflict(R"([{"kind":"text","text":"a"},{"kind":"photo","with_previous":true}])"));
  assert(!conflict(R"([{"kind":"gesture","gesture":"nod_yes"},{"kind":"look","pan":0,"tilt":0}])"));
  { JsonDocument d; deserializeJson(d, kDisco); d["actions"][0]["with_previous"] = "ja"; assert(validate(d.as<JsonVariantConst>())); }
  { JsonDocument d; deserializeJson(d, kDisco); d["actions"][0]["kind"] = "sound"; d["actions"][0]["sound"] = "siren"; assert(validate(d.as<JsonVariantConst>())); }
  std::puts("robot app policy/player: ok");
}
