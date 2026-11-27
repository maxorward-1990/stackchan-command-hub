#include "ClockPolicy.h"
#include <esp_sntp.h>
#include "GestureAliasPolicy.h"
#include "SensorMonitor.h"
#include "GeminiToolBridge.h"
#include "ToolTogglePolicy.h"
#include "TodoStore.h"
#include "FocusApp.h"
#include "DeskApp.h"
#include "GeminiLiveProbe.h"
#include "MemoryStore.h"
#include <M5Unified.h>
#include "ScreenImage.h"
#include "CapabilityPolicy.h"
#include "InternetVisual.h"
#include "WebResearch.h"
#include "SmartHome.h"
#include <M5StackChan.h>

bool GeminiToolBridge::motionActive() const {
  return servoGestures_.active() || M5StackChan.Motion.isMoving();
}

String GeminiToolBridge::functionDeclarationsJson() {
  // Keep tool declarations deterministic: do not block Gemini setup on a LAN
  // /tools fetch. Local robot tools are handled here; gateway tools still go
  // through gateway_.callTool().
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  auto noArgTool = [&](const char* name, const char* description) {
    auto tool = arr.add<JsonObject>();
    tool["name"] = name;
    tool["description"] = description;
    auto params = tool["parameters"].to<JsonObject>();
    params["type"] = "object";
    params["properties"].to<JsonObject>();
  };

  noArgTool("get_robot_status", "Get StackChan robot status: battery, network, state, and local memory health.");
  noArgTool("ping_gateway", "Check that the home-server StackChan Tool Gateway is reachable.");
  noArgTool("get_server_time", "Get current Unix time from the home server running the gateway.");
  noArgTool("ha_get_light_states", "Get Home Assistant states for StackChan-allowlisted lights.");

  auto haControl = arr.add<JsonObject>();
  haControl["name"] = "ha_control_light";
  haControl["description"] = "Control one allowlisted Home Assistant light. Use only when the user explicitly asks to change a light.";
  auto hcParams = haControl["parameters"].to<JsonObject>();
  hcParams["type"] = "object";
  auto hcProps = hcParams["properties"].to<JsonObject>();
  hcProps["entity_id"]["type"] = "string";
  hcProps["entity_id"]["description"] = "Allowlisted HA light entity_id.";
  hcProps["action"]["type"] = "string";
  hcProps["action"]["description"] = "on, off, or toggle.";
  hcProps["brightness_pct"]["type"] = "integer";
  hcProps["brightness_pct"]["minimum"] = 1;
  hcProps["brightness_pct"]["maximum"] = 100;
  hcParams["required"].add("entity_id");
  hcParams["required"].add("action");

  auto todos = arr.add<JsonObject>();
  todos["name"] = "manage_todos";
  todos["description"] = "The user's to-do list stored locally on the robot. Use when the user asks to add, read, complete or remove a to-do/reminder item ('skriv upp att...', 'vad har jag på listan?'). List before completing/removing if unsure which item. Read items back briefly in the user's language.";
  auto tdParams = todos["parameters"].to<JsonObject>();
  tdParams["type"] = "object";
  auto tdProps = tdParams["properties"].to<JsonObject>();
  tdProps["action"]["type"] = "string";
  tdProps["action"]["description"] = "list, add, complete, remove, or clear_done.";
  tdProps["text"]["type"] = "string";
  tdProps["text"]["description"] = "Item text for add, or words matching an item for complete/remove.";
  tdProps["id"]["type"] = "integer";
  tdProps["id"]["description"] = "Item id from list (preferred for complete/remove).";
  tdParams["required"].add("action");

  auto timerTool = arr.add<JsonObject>();
  timerTool["name"] = "control_timer";
  timerTool["description"] = "Local countdown timer shown as a widget at the bottom of the robot screen. Use when the user asks to set, stop, pause, resume or check a timer ('sätt en timer på 2 minuter', 'hur lång tid är kvar?'). Works offline. The robot cannot play an alarm sound; never claim it will ring. If the user's whole request was only this timer command (no question or further task), confirm in one short sentence and also call end_session in the same turn so the widget shows at once; if they asked for anything more, keep listening.";
  auto tmParams = timerTool["parameters"].to<JsonObject>();
  tmParams["type"] = "object";
  auto tmProps = tmParams["properties"].to<JsonObject>();
  tmProps["action"]["type"] = "string";
  for (const char* a : {"start", "stop", "pause", "resume", "status"}) tmProps["action"]["enum"].add(a);
  tmProps["minutes"]["type"] = "integer";
  tmProps["minutes"]["minimum"] = 0;
  tmProps["minutes"]["maximum"] = 90;
  tmProps["minutes"]["description"] = "Whole minutes for start; combine with seconds.";
  tmProps["seconds"]["type"] = "integer";
  tmProps["seconds"]["minimum"] = 0;
  tmProps["seconds"]["maximum"] = 5400;
  tmProps["seconds"]["description"] = "Seconds for start ('30 sekunder' -> 30, 'en halv minut' -> 30). Total 10 s to 90 min.";
  tmParams["required"].add("action");

  auto searchMemory = arr.add<JsonObject>();
  searchMemory["name"] = "search_memory";
  searchMemory["description"] = "Time-aware local memory search over active context, safe facts, and semantic summaries. Use for ordinary recall questions. It groups by observed time/session, prefers recent results by default, never exposes raw archived dialogues, and never exposes private secrets/PINs/passwords.";
  auto smParams = searchMemory["parameters"].to<JsonObject>();
  smParams["type"] = "object";
  auto smProps = smParams["properties"].to<JsonObject>();
  smProps["query"]["type"] = "string";
  smProps["query"]["description"] = "Memory search query.";
  smParams["required"].add("query");

  auto rememberPrivate = arr.add<JsonObject>();
  rememberPrivate["name"] = "remember_private_memory";
  rememberPrivate["description"] = "Store a private local memory such as a PIN, code, password, token, address, or other user-explicit secret. Use only when the user explicitly asks you to remember it. This stays on the robot SD card and must never be sent to Hermes/gateway or ordinary search_memory.";
  auto rpmParams = rememberPrivate["parameters"].to<JsonObject>();
  rpmParams["type"] = "object";
  auto rpmProps = rpmParams["properties"].to<JsonObject>();
  rpmProps["kind"]["type"] = "string";
  rpmProps["kind"]["description"] = "Type, e.g. private_code, private_pin, private_password, private_address, private_note.";
  rpmProps["label"]["type"] = "string";
  rpmProps["label"]["description"] = "Short non-secret label describing what this value is for.";
  rpmProps["value"]["type"] = "string";
  rpmProps["value"]["description"] = "The exact private value the user explicitly asked to remember.";
  rpmParams["required"].add("value");

  auto recallPrivate = arr.add<JsonObject>();
  recallPrivate["name"] = "recall_private_memory";
  recallPrivate["description"] = "Recall a private local memory only when the user explicitly asks for that saved private value. Never call this for ordinary conversation, never forward its result to external tools, and do not expose it unless the user clearly requested recall.";
  auto rclParams = recallPrivate["parameters"].to<JsonObject>();
  rclParams["type"] = "object";
  auto rclProps = rclParams["properties"].to<JsonObject>();
  rclProps["query"]["type"] = "string";
  rclProps["query"]["description"] = "Short label/query, e.g. 'PIN', 'door code', 'wifi password'. Empty means latest private memory.";

  auto askHermes = arr.add<JsonObject>();
  askHermes["name"] = "ask_hermes";
  askHermes["description"] = "Create a safe structured request for the configured external assistant gateway only for explicit external help. Never use for 'remember this' or private/sensitive content such as PINs/passwords/tokens; those stay local.";
  auto ahParams = askHermes["parameters"].to<JsonObject>();
  ahParams["type"] = "object";
  auto ahProps = ahParams["properties"].to<JsonObject>();
  ahProps["question"]["type"] = "string";
  ahProps["question"]["description"] = "Question or task for Hermes. Do not include passwords, tokens, or secrets.";
  ahProps["urgency"]["type"] = "string";
  ahProps["urgency"]["description"] = "low, normal, or high.";
  ahParams["required"].add("question");

  auto setEmotion = arr.add<JsonObject>();
  setEmotion["name"] = "set_emotion";
  setEmotion["description"] = "Set StackChan face/emotion state.";
  auto seParams = setEmotion["parameters"].to<JsonObject>();
  seParams["type"] = "object";
  auto seProps = seParams["properties"].to<JsonObject>();
  seProps["emotion"]["type"] = "string";
  seProps["emotion"]["description"] = "One of neutral,happy,thinking,looking,speaking,found,error,sleep.";
  seParams["required"].add("emotion");

  auto servo = arr.add<JsonObject>();
  servo["name"] = "servo_gesture";
  servo["description"] = "Perform a safe head gesture or little_dance. Live pauses the microphone, waits for the physical movement to finish, then returns completed=true and resumes conversation. Use motors for nod/look up requests; not camera or face changes. Stay silent until completed.";
  auto sgParams = servo["parameters"].to<JsonObject>();
  sgParams["type"] = "object";
  auto sgProps = sgParams["properties"].to<JsonObject>();
  sgProps["gesture"]["type"] = "string";
  sgProps["gesture"]["description"] = "One of center_head,look_at_user,look_left_small,look_right_small,look_left,look_right,look_up,look_down,look_top_left,look_top_right,search_left_wide,search_left,search_center,search_right,search_right_wide,nod_yes,nod_once,shake_no,curious_tilt,speaking_micro_motion,little_dance,stop_motion. little_dance is a gentle 2.4-second dance returning to the current anchor. For a nod then look up, call nod_yes followed by look_up; Live executes in order. Use head_motion for custom small motions.";
  sgParams["required"].add("gesture");

  auto motion = arr.add<JsonObject>();
  motion["name"] = "head_motion";
  motion["description"] = "Create a safe smooth StackChan head motion on the fly. Use this when the user asks for a custom amount such as 'a little left', 'slightly up', or to keep looking toward someone after a camera search. Coordinates are deltas from the robot's current look anchor: x_deg negative means robot's left, positive means robot's right; y_deg positive means up, negative means down. Firmware clamps to safe ranges, executes asynchronously, and the final keyframe becomes the new look anchor.";
  auto hmParams = motion["parameters"].to<JsonObject>();
  hmParams["type"] = "object";
  auto hmProps = hmParams["properties"].to<JsonObject>();
  hmProps["motion_name"]["type"] = "string";
  hmProps["motion_name"]["description"] = "Short descriptive name, e.g. slight_left, curious_scan.";
  auto steps = hmProps["steps"].to<JsonObject>();
  steps["type"] = "array";
  steps["description"] = "1 to 6 keyframes, each relative to the current look anchor. For a small left turn use one step like {x_deg:-12,y_deg:0,speed:500,hold_ms:500}. For a smooth expressive sequence, include multiple keyframes and usually end at {x_deg:0,y_deg:0} to preserve the current anchor.";
  steps["minItems"] = 1;
  steps["maxItems"] = 6;
  auto item = steps["items"].to<JsonObject>();
  item["type"] = "object";
  auto ip = item["properties"].to<JsonObject>();
  ip["x_deg"]["type"] = "number";
  ip["x_deg"]["description"] = "Yaw delta from the current look anchor. Safe useful range -65..65. Negative=left, positive=right.";
  ip["y_deg"]["type"] = "number";
  ip["y_deg"]["description"] = "Pitch delta from the current look anchor. Safe useful range -6..40. Positive=up, negative=down.";
  ip["speed"]["type"] = "integer";
  ip["speed"]["description"] = "Servo speed 100..700 for normal motions; lower is softer.";
  ip["hold_ms"]["type"] = "integer";
  ip["hold_ms"]["description"] = "How long to wait before next keyframe, 100..1500 ms.";
  hmParams["required"].add("steps");

  auto lookCamera = arr.add<JsonObject>();
  lookCamera["name"] = "look_with_camera";
  lookCamera["description"] = "Take exactly one still snapshot with StackChan's camera and send that image into the current Gemini Live conversation for visual analysis. Use when the user asks what you see, to look around, read the scene, identify visible objects, or check whether a searched target is visible in the current sector. While this tool runs, stay silent and do not move the head. For search tasks, take only one photo per sector; if the target is not visible, move to the next search_* sector before calling this tool again.";
  auto lcParams = lookCamera["parameters"].to<JsonObject>();
  lcParams["type"] = "object";
  auto lcProps = lcParams["properties"].to<JsonObject>();
  lcProps["question"]["type"] = "string";
  lcProps["question"]["description"] = "Short visual question, e.g. 'what is in front of me?' or 'what is on the table?'";

  auto clock = arr.add<JsonObject>();
  clock["name"] = "get_current_time";
  clock["description"] = "Read the robot clock NOW for time/date questions, never stale search snippets. Supports UTC, Stockholm/Sweden (DST handled), Tokyo and Port Moresby. Unknown zones are not supported; do not guess a live time.";
  auto cp = clock["parameters"].to<JsonObject>(); cp["type"] = "object";
  cp["properties"]["timezone"]["type"] = "string";
  auto zones = cp["properties"]["timezone"]["enum"].to<JsonArray>();
  for (const char* zone : {"UTC", "Europe/Stockholm", "Asia/Tokyo", "Pacific/Port_Moresby"}) zones.add(zone);

  auto endSession = arr.add<JsonObject>();
  endSession["name"] = "end_session";
  endSession["description"] = "End the current continuous StackChan conversation when the user says goodbye, good night, stop listening, or otherwise clearly wants the session to finish. The robot stops listening after its final response and enters sleep/idle mode.";
  auto esParams = endSession["parameters"].to<JsonObject>();
  esParams["type"] = "object";
  auto esProps = esParams["properties"].to<JsonObject>();
  esProps["reason"]["type"] = "string";
  esProps["reason"]["description"] = "Brief reason, e.g. user_said_goodbye, bedtime, stop_listening.";

  auto image = arr.add<JsonObject>();
  image["name"] = "show_information";
  image["description"] = "Show requested information on the 320x240 robot screen: concise text, a list or percentage bar chart. Generate the content for the user's request, never substitute a fixed picture. Keep title under 30 characters and text under 250 characters; lists at most 6 short labels, bar charts at most 4. If display fails, shorten and retry. For longer information show successive screens only when the user requests the next part. For photos or illustrations use search_internet_images and show_internet_image.";
  auto iparams = image["parameters"].to<JsonObject>();
  iparams["type"] = "object";
  auto props = iparams["properties"].to<JsonObject>();
  props["type"]["type"] = "string";
  for (const char* kind : {"text", "list", "bars", "clear"}) props["type"]["enum"].add(kind);
  props["title"]["type"] = "string";
  props["text"]["type"] = "string";
  props["items"]["type"] = "array";
  auto entry = props["items"]["items"].to<JsonObject>();
  entry["type"] = "object";
  entry["properties"]["label"]["type"] = "string";
  entry["properties"]["value"]["type"] = "number";
  entry["properties"]["value"]["description"] = "Percentage from 0 to 100 for bars; omit for lists. Do not invent data.";
  entry["required"].add("label");
  iparams["required"].add("type");
  for (const char* name : {"lookup_wikipedia", "search_internet_images"}) {
    auto tool = arr.add<JsonObject>(); tool["name"] = name;
    tool["description"] = String(name) == "lookup_wikipedia"
      ? "Look up a Wikipedia article over HTTPS. Use only when the user explicitly asks for Wikipedia, a lookup or a source; otherwise answer from your own knowledge. Query only the subject, never private details. Returns source excerpts; summarize using show_information when asked to show info. Default Swedish, retry English if needed. Not a general web browser or live news service."
      : "Search Wikimedia Commons directly for relevant JPEG photos or illustrations from the internet. Returns candidates with descriptions and credits, not displayed yet. English subject queries often work better; select a relevant candidate with show_internet_image. Never substitute a preset image or send private details in queries.";
    auto params = tool["parameters"].to<JsonObject>(); params["type"] = "object";
    auto fields = params["properties"].to<JsonObject>(); fields["query"]["type"] = "string";
    params["required"].add("query");
    if (String(name) == "lookup_wikipedia") {
      fields["language"]["type"] = "string";
      fields["language"]["enum"].add("sv"); fields["language"]["enum"].add("en");
    }
  }
  auto webImage = arr.add<JsonObject>(); webImage["name"] = "show_internet_image";
  webImage["description"] = "Download and display a relevant image_id from the latest search_internet_images results. No arbitrary URL access. Only claim it is displayed after ok=true; identify source/creator and do not pretend an illustration is a photograph.";
  auto wp = webImage["parameters"].to<JsonObject>(); wp["type"] = "object";
  wp["properties"]["image_id"]["type"] = "integer"; wp["required"].add("image_id");
  if (WebResearch::available()) {
    auto search = arr.add<JsonObject>(); search["name"] = "search_web";
    search["description"] = "Search the public web (Tavily search API) for current information, news, prices, comparisons and facts beyond Wikipedia. Use whenever the user asks you to google/search/check online or freshness matters. Returns result titles, URLs and short snippets. Send a short standalone public query in the best language for the topic, never personal details, secrets or conversation history. Stay silent while waiting; do not announce success until ok=true.";
    auto params = search["parameters"].to<JsonObject>(); params["type"] = "object";
    params["properties"]["query"]["type"] = "string";
    params["properties"]["query"]["description"] = "Public standalone research question, at most 600 UTF-8 bytes; specify place/date only if relevant and not private.";
    params["required"].add("query");
  }
  if (SmartHome::available()) {
    auto home = arr.add<JsonObject>(); home["name"] = "control_lights";
    String names = SmartHome::deviceNames();
    String d = "Control the owner's Smart Life (Tuya) lights and sockets directly from the robot. Use when the user asks to turn lights/lamps/sockets on or off, dim them, change colour, or asks which lamps exist (action=list). target is an exact device name, a room/word that appears in device names (e.g. 'Living Room', 'Kitchen'), 'lights' for every lamp, or 'all' for every device. Translate Swedish room words to the English device names. Stay silent while waiting; confirm only devices listed in changed.";
    if (names.length()) d += " Known devices: " + names + ".";
    String sc = SmartHome::sceneNames();
    d += " Prefer action=scene with target=<scene name> when the user names one of the owner's scenes (e.g. 'kör Mys') or asks for a mood the scene covers; a scene sets several lamps (on/off/brightness/colour) at once.";
    if (sc.length()) d += " Known scenes: " + sc + ".";
    d += " For several different devices, separate them with commas in target.";
    home["description"] = d;
    auto p = home["parameters"].to<JsonObject>(); p["type"] = "object";
    auto f = p["properties"].to<JsonObject>();
    f["target"]["type"] = "string"; f["target"]["description"] = "Device name, room word, comma-separated device names, 'lights', 'all', or the scene name for action=scene. Required except for action=list.";
    f["action"]["type"] = "string";
    for (const char* a : {"on", "off", "brightness", "color", "white", "list", "scene"}) f["action"]["enum"].add(a);
    f["brightness"]["type"] = "integer"; f["brightness"]["description"] = "1-100 percent, for action=brightness (or colour intensity).";
    f["color"]["type"] = "string";
    for (const char* c : {"red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"}) f["color"]["enum"].add(c);
    p["required"].add("action");
  }
  for (int i = static_cast<int>(arr.size()) - 1; i >= 0; --i) {
    const char* name = arr[i]["name"] | "";
    if (!CapabilityPolicy::allowed(name, gateway_.isEnabled()) || !ToolToggle::allowed(name, ToolToggle::mask())) arr.remove(i);
  }
  String out;
  serializeJson(arr, out);
  return out;
}

String GeminiToolBridge::handleFunctionCall(const String& name, const JsonVariantConst& args,
                                            const String& sessionId) {
  if (!CapabilityPolicy::allowed(name.c_str(), gateway_.isEnabled()))
    return errorJson("tool_unavailable", "No external gateway is configured. Do not ask the user to restart a server.");
  if (!ToolToggle::allowed(name.c_str(), ToolToggle::mask()))
    return errorJson("tool_disabled", "The user turned this capability off in settings. Answer without it.");
  JsonDocument localResponse;
  LocalStatus local = handleLocal(name, args, localResponse);
  if (local == LocalStatus::Handled || local == LocalStatus::Error) {
    String out;
    serializeJson(localResponse, out);
    return out;
  }

  if (name == "ask_hermes") {
    String question = String((const char*)(args["question"] | ""));
    String q = question;
    q.toLowerCase();
    if (q.indexOf("pin") >= 0 || q.indexOf("\xD0\xBF\xD0\xB8\xD0\xBD") >= 0 ||
        q.indexOf("password") >= 0 || q.indexOf("\xD0\xBF\xD0\xB0\xD1\x80\xD0\xBE\xD0\xBB") >= 0 ||
        q.indexOf("token") >= 0 || q.indexOf("secret") >= 0 || q.indexOf("\xD1\x81\xD0\xB5\xD0\xBA\xD1\x80\xD0\xB5\xD1\x82") >= 0 ||
        q.indexOf("code") >= 0 || q.indexOf("\xD0\xBA\xD0\xBE\xD0\xB4") >= 0 ||
        q.indexOf("remember") >= 0 || q.indexOf("\xD0\xB7\xD0\xB0\xD0\xBF\xD0\xBE\xD0\xBC") >= 0) {
      JsonDocument blocked;
      blocked["ok"] = false;
      blocked["blocked"] = true;
      blocked["error"] = "private_memory_request_not_forwarded";
      blocked["message"] = "Private remember/secrets/PIN content is not forwarded to Hermes. Acknowledge locally; local transcript memory records the conversation automatically.";
      String out;
      serializeJson(blocked, out);
      return out;
    }
  }

  auto gatewayResult = gateway_.callTool(name, args, sessionId);
  if (gatewayResult.ok) return gatewayResult.body;
  return errorJson(gatewayResult.error.length() ? gatewayResult.error : "gateway_call_failed",
                   gatewayResult.body.length() ? gatewayResult.body : "Tool gateway call failed");
}

GeminiToolBridge::LocalStatus GeminiToolBridge::handleLocal(
    const String& name, const JsonVariantConst& args, JsonDocument& response) {
  if (name == "lookup_wikipedia" || name == "search_internet_images" || name == "show_internet_image")
    return InternetVisual::handle(name, args, response) ? LocalStatus::Handled : LocalStatus::Error;
  if (name == "show_information") {
    bool ok = ScreenImage::showInformation(args);
    response["ok"] = ok;
    response["message"] = ok ? "Requested information displayed for 60 seconds." : "Invalid content or too much for the LCD. Shorten title/text/items and retry.";
    return ok ? LocalStatus::Handled : LocalStatus::Error;
  }
  if (name == "get_robot_status") {
    response["ok"] = true;
    response["battery_mv"] = M5StackChan.getBatteryVoltage();
    response["battery_ma"] = M5StackChan.getBatteryCurrent();
    response["battery_percent"] = SensorMonitor::batteryPercent();
    response["battery_state"] = SensorMonitor::batteryState();
    response["free_heap"] = ESP.getFreeHeap();
    response["free_psram"] = ESP.getFreePsram();
    response["gateway_enabled"] = gateway_.isEnabled();
    return LocalStatus::Handled;
  }

  if (name == "manage_todos") {
    TodoStore::handle(args, response);
    return LocalStatus::Handled;
  }
  if (name == "control_timer") {
    const bool start = !std::strcmp(args["action"] | "", "start");
    const int code = FocusApp::voice(args, response);
    if (code == 200 && start) DeskApp::stop();
    return code == 200 ? LocalStatus::Handled : LocalStatus::Error;
  }

  if (name == "set_emotion") {
    const char* emotion = args["emotion"] | "neutral";
    emotion_.setEmotion(emotion);
    response["ok"] = true;
    response["emotion"] = emotion_.currentEmotion();
    return LocalStatus::Handled;
  }

  if (name == "search_memory") {
    const char* queryRaw = args["query"] | "";
    String query = String(queryRaw);
    String q = query;
    q.toLowerCase();
    response["ok"] = true;
    response["source"] = "local_active_dialogue_context_only";
    response["query"] = query;

    if (q.indexOf("pin") >= 0 || q.indexOf("\xD0\xBF\xD0\xB8\xD0\xBD") >= 0 ||
        q.indexOf("password") >= 0 || q.indexOf("\xD0\xBF\xD0\xB0\xD1\x80\xD0\xBE\xD0\xBB") >= 0 ||
        q.indexOf("token") >= 0 || q.indexOf("secret") >= 0 || q.indexOf("\xD1\x81\xD0\xB5\xD0\xBA\xD1\x80\xD0\xB5\xD1\x82") >= 0 ||
        q.indexOf("code") >= 0 || q.indexOf("\xD0\xBA\xD0\xBE\xD0\xB4") >= 0) {
      response["private_query"] = true;
      response["active_context"] = "";
      response["instruction"] = "search_memory never exposes private values. If and only if the user explicitly asks to recall a saved private code/PIN/password, call recall_private_memory locally instead.";
      return LocalStatus::Handled;
    }

    if (memory_) {
      String hits = memory_->searchMemory(query, 8, 9000);
      response["retrieval_json"] = hits;
      response["raw_dialogues_exposed"] = false;
      response["retrieval_layers"] = "active_context,facts,semantic_summaries";
      response["time_aware"] = true;
    } else {
      response["retrieval_json"] = "";
      response["warning"] = "memory_store_not_attached";
    }
    response["instruction"] = "Use the time-aware local retrieval_json. Prefer active/fresh results; if several dates/sessions are present, answer as separate episodes and do not merge them. Do not request raw archived dialogues or expose private values.";
    return LocalStatus::Handled;
  }

  if (name == "remember_private_memory") {
    if (!memory_) {
      response["ok"] = false;
      response["error"] = "memory_store_not_attached";
      return LocalStatus::Error;
    }
    String kind = String((const char*)(args["kind"] | "private_note"));
    String label = String((const char*)(args["label"] | "private memory"));
    String value = String((const char*)(args["value"] | ""));
    bool ok = memory_->rememberPrivateMemory(kind, label, value);
    response["ok"] = ok;
    response["stored"] = ok;
    response["kind"] = kind;
    response["label"] = label;
    response["recall_policy"] = "explicit_user_request_only_local";
    response["value_echoed"] = false;
    response["message"] = ok ? "Private memory stored locally on SD. Do not repeat the value unless the user explicitly asks to recall it." : "Private memory was not stored.";
    return ok ? LocalStatus::Handled : LocalStatus::Error;
  }

  if (name == "recall_private_memory") {
    if (!memory_) {
      response["ok"] = false;
      response["error"] = "memory_store_not_attached";
      return LocalStatus::Error;
    }
    String query = String((const char*)(args["query"] | ""));
    String kind, label, value, ts;
    bool found = memory_->recallPrivateMemory(query, kind, label, value, ts);
    response["ok"] = found;
    response["private_recall"] = true;
    response["query"] = query;
    if (found) {
      response["kind"] = kind;
      response["label"] = label;
      response["value"] = value;
      response["ts"] = ts;
      response["recall_policy"] = "explicit_user_request_only_local";
      response["external_forwarding_allowed"] = false;
    } else {
      response["error"] = "private_memory_not_found";
      response["message"] = "No matching local private memory was found.";
    }
    return found ? LocalStatus::Handled : LocalStatus::Error;
  }

  if (name == "servo_gesture") {
    const char* requested = args["gesture"] | "";
    // v58: improvised names map to a real gesture so the turn never stalls on an error.
    const char* gesture = GestureAliasPolicy::resolve(std::string(requested));
    if (strcmp(gesture, requested) != 0) {
      Serial.printf("[VERKTYG] gesture alias %s -> %s\n", requested, gesture);
      response["aliased_from"] = requested;
    }
    bool queued = servoGestures_.queueGesture(String(gesture));
    response["ok"] = queued;
    if (queued) {
      response["queued"] = gesture;
      response["active"] = servoGestures_.currentGesture();
      response["async"] = true;
      response["anchor_x"] = servoGestures_.anchorX();
      response["anchor_y"] = servoGestures_.anchorY();
    } else {
      response["error"] = "unknown_gesture";
      response["allowed"] = "center_head,look_at_user,look_left_small,look_right_small,look_left,look_right,look_up,look_down,look_top_left,look_top_right,search_left_wide,search_left,search_center,search_right,search_right_wide,nod_yes,nod_once,shake_no,curious_tilt,speaking_micro_motion,little_dance,stop_motion";
      return LocalStatus::Error;
    }
    return LocalStatus::Handled;
  }

  if (name == "head_motion") {
    auto clampInt = [](int v, int lo, int hi) -> int {
      if (v < lo) return lo;
      if (v > hi) return hi;
      return v;
    };
    ServoGestureController::Step steps[6]{};
    uint8_t count = 0;
    JsonArrayConst arr = args["steps"].as<JsonArrayConst>();
    for (JsonObjectConst s : arr) {
      if (count >= 6) break;
      float xDeg = s["x_deg"] | 0.0f;
      float yDeg = s["y_deg"] | 0.0f;
      int speed = s["speed"] | 500;
      int holdMs = s["hold_ms"] | 500;
      xDeg = constrain(xDeg, -65.0f, 65.0f);
      yDeg = constrain(yDeg, -6.0f, 40.0f);
      steps[count].x = clampInt(static_cast<int>(xDeg * 10.0f), -650, 650);
      steps[count].y = clampInt(static_cast<int>(yDeg * 10.0f), -60, 400);
      steps[count].speed = clampInt(speed, 100, 700);
      steps[count].holdMs = static_cast<uint16_t>(clampInt(holdMs, 100, 1500));
      steps[count].relative = true;
      count++;
    }
    if (count == 0) {
      response["ok"] = false;
      response["error"] = "missing_steps";
      response["message"] = "head_motion requires 1..6 steps with x_deg/y_deg/speed/hold_ms";
      return LocalStatus::Error;
    }
    String motionName = String((const char*)(args["motion_name"] | "custom_motion"));
    bool queued = servoGestures_.queueSteps(motionName, steps, count);
    response["ok"] = queued;
    response["queued"] = motionName;
    response["async"] = true;
    response["step_count"] = count;
    response["clamped"] = true;
    response["anchor_x"] = servoGestures_.anchorX();
    response["anchor_y"] = servoGestures_.anchorY();
    response["coordinate_note"] = "x_deg negative=robot left, positive=robot right; y_deg positive=up, negative=down; values are deltas from the current look anchor; final keyframe becomes the new anchor";
    return queued ? LocalStatus::Handled : LocalStatus::Error;
  }

  if (name == "get_current_time") {
    const char* zone = args["timezone"] | "Europe/Stockholm";
    const time_t now = time(nullptr); char local[32]; int offset = 0;
    const bool ok = ClockPolicy::format(now, zone, local, sizeof(local), offset);
    response["ok"] = ok;
    if (!ok) { response["error"] = ClockPolicy::valid(now) ? "unsupported_timezone" : "clock_not_ready"; return LocalStatus::Error; }
    response["datetime"] = local; response["timezone"] = zone; response["utc_offset_minutes"] = offset;
    response["utc_epoch_seconds"] = static_cast<long long>(now);
    response["network_sync_confirmed"] = sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED;
    response["clock_note"] = "Fresh device-clock reading; RTC fallback may drift. Do not claim precision beyond clock validity.";
    return LocalStatus::Handled;
  }

  if (name == "end_session") {
    const char* reason = args["reason"] | "user_requested";
    // Sleep/rest semantics: explicitly return the physical head home and reset
    // the persistent look anchor only when the session is ending.
    servoGestures_.queueGesture("center_head");
    response["ok"] = true;
    response["ending"] = true;
    response["reason"] = reason;
    response["message"] = "Conversation will end after the final response.";
    return LocalStatus::Handled;
  }

  if (name == "look_with_camera") {
    const char* question = args["question"] | "What is visible in this snapshot?";
    emotion_.setEmotion("looking");
    if (!gemini_ || !gemini_->isReady()) {
      response["ok"] = false;
      response["error"] = "gemini_not_ready";
      response["message"] = "Cannot send camera image because Gemini Live is not ready.";
      return LocalStatus::Error;
    }
    String imageBase64;
    if (!camera_.captureJpegBase64(imageBase64)) {
      response["ok"] = false;
      response["error"] = camera_.lastError();
      response["message"] = "Camera capture failed.";
      response["camera_enabled"] = camera_.enabled();
      return LocalStatus::Error;
    }
    String prompt = "This is one frame from my StackChan camera. Answer concisely and practically in the user's language. User question: ";
    prompt += question;
    bool sent = gemini_->sendImageTurn(imageBase64, prompt);
    // The bright white looking LEDs are useful only while the camera is actively
    // capturing/sending. Once the still image is handed to Gemini Live, switch
    // to thinking so the white assist light cannot stick through the later
    // audio response or overload the small robot power/speaker path.
    emotion_.setEmotion(sent ? "thinking" : "error");
    response["ok"] = sent;
    response["image_sent_to_current_gemini_session"] = sent;
    response["jpeg_bytes"] = camera_.lastJpegBytes();
    response["base64_bytes"] = camera_.lastBase64Bytes();
    response["message"] = sent ? "Snapshot was sent to the current Gemini Live conversation for visual analysis." : "Failed to send snapshot into Gemini Live.";
    return sent ? LocalStatus::Handled : LocalStatus::Error;
  }

  return LocalStatus::NotHandled;
}

String GeminiToolBridge::errorJson(const String& code, const String& message) {
  JsonDocument doc;
  doc["ok"] = false;
  doc["error"] = code;
  doc["message"] = message;
  String out;
  serializeJson(doc, out);
  return out;
}
