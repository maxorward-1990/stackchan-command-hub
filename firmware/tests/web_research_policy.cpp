#include "../src/WebResearchPolicy.h"
#include <cassert>
#include <cstdio>
#include <string>
int main() {
  using namespace WebResearchPolicy;
  assert(std::string(endpoint) == "https://api.tavily.com/search");
  // Free-plan safety: basic depth (1 credit) and at most 5 results.
  assert(requestBody("Öland befolkning") == "{\"query\":\"Öland befolkning\",\"search_depth\":\"basic\",\"include_answer\":\"basic\",\"max_results\":5}");
  assert(requestBody("a\"b\\c\nd").find("a\\\"b\\\\c d") != std::string::npos);
  assert(requestBody(std::string(1000, 'x')).size() < 500);
  assert(jsonEscape("åå", 3) == "å");
  assert(clip("hej\ndu", 100) == "hej du" && clip("abcdef", 3) == "abc...");
  assert(!acceptedUrl("http://example.com/x") && acceptedUrl("https://www.scb.se/a"));
  assert(std::string(errorFor(200)).empty());
  assert(std::string(errorFor(401)) == "tavily_invalid_key");
  assert(std::string(errorFor(432)) == "tavily_monthly_quota_used_up");
  assert(std::string(errorFor(429)) == "tavily_rate_limited_try_later");
  assert(std::string(errorFor(-1)) == "tavily_https_transport_failed");
  std::puts("web_research_policy ok");
}
