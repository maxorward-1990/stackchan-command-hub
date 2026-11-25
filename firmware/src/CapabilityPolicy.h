#pragma once
#include <cstring>
namespace CapabilityPolicy {
inline bool external(const char* n) {
 return std::strcmp(n,"ping_gateway")==0 || std::strcmp(n,"get_server_time")==0 || std::strcmp(n,"ha_get_light_states")==0 || std::strcmp(n,"ha_control_light")==0 || std::strcmp(n,"ask_hermes")==0;
}
inline bool allowed(const char* n, bool gateway) { return gateway || !external(n); }
}
