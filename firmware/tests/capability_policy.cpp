#include "../src/CapabilityPolicy.h"
#include <cassert>

int main() {
  assert(!CapabilityPolicy::allowed("ping_gateway", false));
  assert(!CapabilityPolicy::allowed("ask_hermes", false));
  assert(!CapabilityPolicy::allowed("get_server_time", false));
  assert(!CapabilityPolicy::allowed("ha_get_light_states", false));
  assert(!CapabilityPolicy::allowed("ha_control_light", false));
  assert(CapabilityPolicy::allowed("ping_gateway", true));
  assert(CapabilityPolicy::allowed("look_with_camera", false));
  assert(CapabilityPolicy::allowed("show_information", false));
  assert(CapabilityPolicy::allowed("lookup_wikipedia", false));
  assert(CapabilityPolicy::allowed("search_web", false));
  assert(CapabilityPolicy::allowed("search_internet_images", false));
  assert(CapabilityPolicy::allowed("show_internet_image", false));
  assert(CapabilityPolicy::allowed("search_memory", false));
  assert(CapabilityPolicy::allowed("servo_gesture", false));
}