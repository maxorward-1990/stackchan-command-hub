#include "../src/ToolTogglePolicy.h"
#include <cassert>
using namespace ToolToggle;
int main() {
  uint8_t d = defaults();
  assert(!allowed("lookup_wikipedia", d));            // Wikipedia off by default
  assert(allowed("search_internet_images", d));
  assert(allowed("servo_gesture", d));
  assert(allowed("end_session", 0));                 // core tools never disabled
  assert(allowed("lookup_wikipedia", d | Wikipedia));
  assert(!allowed("head_motion", d & ~Gestures));
  assert(!allowed("show_internet_image", d & ~Images));
  assert(!allowed("look_with_camera", d & ~Camera));
  assert(!allowed("recall_private_memory", d & ~Memory));
  assert(!allowed("manage_todos", d & ~Memory));
  assert(allowed("manage_todos", d));
  assert(!allowed("show_information", d & ~Screen));
  assert(!allowed("set_emotion", d & ~Emotions));
}
