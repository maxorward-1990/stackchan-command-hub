#include "TodoStore.h"
#include "TodoPolicy.h"

namespace {
fs::FS* g_fs = nullptr;
std::vector<TodoPolicy::Item> g_items;
bool g_loaded = false;
constexpr const char* kPath = "/todos.json";

void load() {
  if (g_loaded || !g_fs) return;
  g_loaded = true;
  File f = g_fs->open(kPath, "r");
  if (!f) return;
  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); return; }
  f.close();
  for (JsonObjectConst o : doc["items"].as<JsonArrayConst>()) {
    if (g_items.size() >= TodoPolicy::kMaxItems) break;
    std::string t = TodoPolicy::clean(o["text"] | "");
    if (t.empty()) continue;
    g_items.push_back({o["id"] | TodoPolicy::nextId(g_items), t, o["done"] | false});
  }
}

bool save() {
  if (!g_fs) return false;
  JsonDocument doc;
  auto arr = doc["items"].to<JsonArray>();
  for (const auto& i : g_items) { auto o = arr.add<JsonObject>(); o["id"] = i.id; o["text"] = i.text.c_str(); o["done"] = i.done; }
  File f = g_fs->open(kPath, "w");
  if (!f) return false;
  bool ok = serializeJson(doc, f) > 0;
  f.close();
  return ok;
}
}

namespace TodoStore {
void attach(fs::FS& fs) { g_fs = &fs; g_loaded = false; g_items.clear(); }

int handle(JsonVariantConst in, JsonDocument& out) {
  load();
  String action = in["action"] | "list";
  std::string text = in["text"] | "";
  uint32_t id = in["id"] | 0;
  using TodoPolicy::Result;
  Result r = Result::Ok;
  bool changed = true;
  if (action == "add") { uint32_t nid = 0; r = TodoPolicy::add(g_items, text, &nid); if (r == Result::Ok) out["added_id"] = nid; }
  else if (action == "complete") r = TodoPolicy::complete(g_items, id, text);
  else if (action == "remove") r = TodoPolicy::remove(g_items, id, text);
  else if (action == "clear_done") out["removed"] = TodoPolicy::clearDone(g_items);
  else if (action == "list") changed = false;
  else { out["ok"] = false; out["error"] = "unknown_action"; return 400; }
  if (r != Result::Ok) { out["ok"] = false; out["error"] = TodoPolicy::error(r); changed = false; }
  else out["ok"] = true;
  if (changed && !save()) { out["ok"] = false; out["error"] = "storage_write_failed"; }
  auto arr = out["items"].to<JsonArray>();
  for (const auto& i : g_items) { auto o = arr.add<JsonObject>(); o["id"] = i.id; o["text"] = i.text.c_str(); o["done"] = i.done; }
  out["max_items"] = TodoPolicy::kMaxItems;
  if (!(out["ok"] | false)) return r == Result::NotFound ? 404 : r == Result::Ok ? 500 : 400;
  return 200;
}
}
