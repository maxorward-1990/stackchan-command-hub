#pragma once
// Pure, tested query-string handling for the USB serial API so
// "/api/sensors?audio=1" routes like HTTP. Bounded: max 256 chars of query.
#include <string>
namespace SerialQueryPolicy {
inline constexpr size_t kMaxQuery = 256;
struct Split { std::string path; std::string query; bool ok = true; };
inline Split split(const std::string& full) {
  Split s; size_t q = full.find('?');
  if (q == std::string::npos) { s.path = full; return s; }
  s.path = full.substr(0, q); s.query = full.substr(q + 1);
  if (s.query.size() > kMaxQuery) { s.query.clear(); s.ok = false; }
  return s;
}
inline int hexv(char c) { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; if (c >= 'A' && c <= 'F') return c - 'A' + 10; return -1; }
inline std::string decode(const std::string& in) {
  std::string o; for (size_t i = 0; i < in.size(); ++i) {
    char c = in[i];
    if (c == '+') o += ' ';
    else if (c == '%' && i + 2 < in.size() && hexv(in[i+1]) >= 0 && hexv(in[i+2]) >= 0) { o += char(hexv(in[i+1]) * 16 + hexv(in[i+2])); i += 2; }
    else o += c;
  } return o;
}
// Finds key in "a=1&b&c=x"; returns true if present (with or without value).
inline bool get(const std::string& query, const std::string& key, std::string* value = nullptr) {
  size_t i = 0;
  while (i <= query.size() && !query.empty()) {
    size_t amp = query.find('&', i); if (amp == std::string::npos) amp = query.size();
    std::string part = query.substr(i, amp - i);
    size_t eq = part.find('=');
    std::string k = decode(eq == std::string::npos ? part : part.substr(0, eq));
    if (!k.empty() && k == key) { if (value) *value = eq == std::string::npos ? "" : decode(part.substr(eq + 1)); return true; }
    i = amp + 1;
  }
  return false;
}
}
