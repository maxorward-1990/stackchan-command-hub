#pragma once
#include <string>
#include <cstddef>
namespace InternetPolicy {
constexpr size_t maxBytes = 65536;
inline bool allowedUrl(const std::string& url) {
  for (const auto* host : {"sv.wikipedia.org", "en.wikipedia.org", "commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"}) {
    std::string prefix = std::string("https://") + host + "/";
    if (url.compare(0, prefix.size(), prefix) == 0 && url.find('\r') == std::string::npos && url.find('\n') == std::string::npos) return true;
  }
  return false;
}
inline std::string encode(const std::string& value) {
  std::string out;
  constexpr char hex[] = "0123456789ABCDEF";
  for (unsigned char c : value) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') out += c;
    else { out += '%'; out += hex[c >> 4]; out += hex[c & 15]; }
  }
  return out;
}
}