#pragma once
// Pure, host-testable rules for the robot's local to-do list (voice tool +
// Command Hub). Bounded so a chatty model can never fill flash or RAM.
#include <cstdint>
#include <string>
#include <vector>

namespace TodoPolicy {
constexpr size_t kMaxItems = 30;
constexpr size_t kMaxText = 120;  // bytes

struct Item { uint32_t id; std::string text; bool done; };
enum class Result { Ok, Empty, Full, NotFound };

// Trim, turn control chars into spaces, cut to kMaxText on a UTF-8 boundary.
inline std::string clean(const std::string& in) {
  std::string s;
  for (unsigned char c : in) s += (c < 0x20 || c == 0x7f) ? ' ' : static_cast<char>(c);
  size_t a = s.find_first_not_of(' ');
  if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(' ');
  s = s.substr(a, b - a + 1);
  if (s.size() > kMaxText) {
    size_t cut = kMaxText;
    while (cut > 0 && (static_cast<unsigned char>(s[cut]) & 0xC0) == 0x80) --cut;
    s = s.substr(0, cut);
    while (!s.empty() && s.back() == ' ') s.pop_back();
  }
  return s;
}

inline std::string lower(std::string s) {
  for (char& c : s) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
  return s;
}

inline uint32_t nextId(const std::vector<Item>& v) {
  uint32_t m = 0;
  for (const auto& i : v) if (i.id > m) m = i.id;
  return m + 1;
}

// id > 0 matches exactly; otherwise case-insensitive (ASCII) substring, open items first.
inline int find(const std::vector<Item>& v, uint32_t id, const std::string& text) {
  if (id) { for (size_t i = 0; i < v.size(); ++i) if (v[i].id == id) return static_cast<int>(i); return -1; }
  std::string q = lower(clean(text));
  if (q.empty()) return -1;
  for (int pass = 0; pass < 2; ++pass)
    for (size_t i = 0; i < v.size(); ++i)
      if ((pass == 1 || !v[i].done) && lower(v[i].text).find(q) != std::string::npos) return static_cast<int>(i);
  return -1;
}

inline Result add(std::vector<Item>& v, const std::string& text, uint32_t* outId = nullptr) {
  std::string t = clean(text);
  if (t.empty()) return Result::Empty;
  if (v.size() >= kMaxItems) return Result::Full;
  uint32_t id = nextId(v);
  v.push_back({id, t, false});
  if (outId) *outId = id;
  return Result::Ok;
}

inline Result complete(std::vector<Item>& v, uint32_t id, const std::string& text) {
  int i = find(v, id, text);
  if (i < 0) return Result::NotFound;
  v[static_cast<size_t>(i)].done = true;
  return Result::Ok;
}

inline Result remove(std::vector<Item>& v, uint32_t id, const std::string& text) {
  int i = find(v, id, text);
  if (i < 0) return Result::NotFound;
  v.erase(v.begin() + i);
  return Result::Ok;
}

inline size_t clearDone(std::vector<Item>& v) {
  size_t before = v.size();
  std::vector<Item> keep;
  for (auto& i : v) if (!i.done) keep.push_back(i);
  v.swap(keep);
  return before - v.size();
}

inline const char* error(Result r) {
  switch (r) {
    case Result::Empty: return "empty_text";
    case Result::Full: return "todo_list_full";
    case Result::NotFound: return "todo_not_found";
    default: return "";
  }
}
}
