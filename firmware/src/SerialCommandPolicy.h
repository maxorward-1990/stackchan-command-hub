#pragma once
#include <string>
#include <cstddef>
// Pure parser for the USB serial debug console (testable on the host).
namespace SerialCommandPolicy {
inline constexpr size_t maxLineBytes = 6144;  // api lines carry prompt/runtime JSON
enum class Verb { None, Help, Status, Mic, Search, Say, Listen, Stop, Api, Perf, Unknown };
struct Command { Verb verb = Verb::None; std::string arg; std::string method, path, body; std::string id; };
inline std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \t\r\n"); if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n"); return s.substr(a, b - a + 1);
}
inline Command parse(const std::string& raw) {
  Command c; std::string line = trim(raw);
  if (line.empty()) return c;
  size_t sp = line.find(' ');
  std::string verb = line.substr(0, sp);
  for (auto& ch : verb) if (ch >= 'A' && ch <= 'Z') ch = static_cast<char>(ch - 'A' + 'a');
  c.arg = sp == std::string::npos ? "" : trim(line.substr(sp + 1));
  if (verb == "help" || verb == "?") c.verb = Verb::Help;
  else if (verb == "status") c.verb = Verb::Status;
  else if (verb == "mic") c.verb = Verb::Mic;
  else if (verb == "search") c.verb = Verb::Search;
  else if (verb == "say") c.verb = Verb::Say;
  else if (verb == "listen") c.verb = Verb::Listen;
  else if (verb == "stop") c.verb = Verb::Stop;
  else if (verb == "perf") c.verb = (c.arg == "on" || c.arg == "off") ? Verb::Perf : Verb::Unknown;
  else if (verb == "api") {
    // api [#id] <GET|POST> </api/path> [json body]
    std::string rest = c.arg;
    if (!rest.empty() && rest[0] == '#') { size_t e = rest.find(' '); c.id = rest.substr(1, e == std::string::npos ? std::string::npos : e - 1); rest = e == std::string::npos ? "" : trim(rest.substr(e + 1)); }
    size_t a = rest.find(' ');
    c.method = rest.substr(0, a);
    for (auto& ch : c.method) if (ch >= 'a' && ch <= 'z') ch = static_cast<char>(ch - 'a' + 'A');
    std::string after = a == std::string::npos ? "" : trim(rest.substr(a + 1));
    size_t b = after.find(' ');
    c.path = after.substr(0, b);
    c.body = b == std::string::npos ? "" : trim(after.substr(b + 1));
    bool okMethod = c.method == "GET" || c.method == "POST";
    bool okPath = c.path.size() > 5 && c.path.size() < 80 && c.path.compare(0, 5, "/api/") == 0 && c.path.find(' ') == std::string::npos;
    bool okId = c.id.size() <= 12;
    c.verb = okMethod && okPath && okId ? Verb::Api : Verb::Unknown;
  }
  else c.verb = Verb::Unknown;
  // Commands that need text are rejected when it is missing.
  if ((c.verb == Verb::Search || c.verb == Verb::Say) && c.arg.empty()) c.verb = Verb::Unknown;
  return c;
}
}
