#pragma once
#include <string>
#include <cstddef>
// Web search via the Tavily Search API (free plan: 1000 searches/month, hard stop,
// no card). Pure helpers so request building and error mapping are host-testable.
namespace WebResearchPolicy {
inline constexpr char provider[] = "tavily";
inline constexpr char endpoint[] = "https://api.tavily.com/search";
inline constexpr size_t maxResults = 5, maxTitle = 160, maxSnippet = 400, maxAnswer = 600, maxQuery = 380;

inline std::string jsonEscape(const std::string& in, size_t cap) {
  std::string out;
  size_t n = in.size() < cap ? in.size() : cap;
  while (n > 0 && n < in.size() && (static_cast<unsigned char>(in[n]) & 0xC0) == 0x80) --n;  // keep UTF-8 intact
  for (size_t i = 0; i < n; ++i) {
    unsigned char c = static_cast<unsigned char>(in[i]);
    if (c == '"') out += "\\\""; else if (c == '\\') out += "\\\\";
    else if (c < 0x20) out += ' ';
    else out += static_cast<char>(c);
  }
  return out;
}

// Basic depth = 1 credit per search. The key travels in the Authorization header, never in the body.
inline std::string requestBody(const std::string& query) {
  return "{\"query\":\"" + jsonEscape(query, maxQuery) +
         "\",\"search_depth\":\"basic\",\"include_answer\":\"basic\",\"max_results\":5}";
}

inline std::string clip(const std::string& s, size_t cap) {
  std::string out;
  for (char c : s) out += (c == '\n' || c == '\r' || c == '\t') ? ' ' : c;
  if (out.size() <= cap) return out;
  size_t cut = cap;
  while (cut > 0 && (static_cast<unsigned char>(out[cut]) & 0xC0) == 0x80) --cut;
  return out.substr(0, cut) + "...";
}

inline bool acceptedUrl(const std::string& url) {
  return url.compare(0, 8, "https://") == 0 && url.size() >= 12 && url.size() <= 500;
}

// Maps Tavily HTTP status to a stable error the model and Command Hub can explain.
inline const char* errorFor(int status) {
  if (status == 200) return "";
  if (status == 401 || status == 403) return "tavily_invalid_key";
  if (status == 429) return "tavily_rate_limited_try_later";
  if (status == 432 || status == 433) return "tavily_monthly_quota_used_up";
  if (status <= 0) return "tavily_https_transport_failed";
  return "tavily_http_error";
}
}
