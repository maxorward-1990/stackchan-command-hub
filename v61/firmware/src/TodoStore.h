#pragma once
// Robot-local to-do list persisted as /todos.json on the selected storage
// (SD or LittleFS). Rules live in pure TodoPolicy.h; shared by the Gemini
// manage_todos tool and the /api/todos route (HTTP, USB, BLE).
#include <ArduinoJson.h>
#include <FS.h>

namespace TodoStore {
void attach(fs::FS& fs);
// in: {action: list|add|complete|remove|clear_done, text?, id?}. Returns HTTP-like status.
int handle(JsonVariantConst in, JsonDocument& out);
}
