#pragma once
// v84: decide the reply language of a web-search answer on the robot. The answer turn runs on a fresh Live
// socket that never heard the user, and a language request inside the (untrusted) search data was ignored.
#include <cstring>
#include <cstddef>
namespace ReplyLanguagePolicy {
enum Lang { Unknown = 0, Swedish = 1, English = 2 };
inline bool inList(const char* w, const char* const* list) {
  for (size_t i = 0; list[i]; ++i) if (!strcmp(w, list[i])) return true;
  return false;
}
inline Lang guess(const char* text) {
  static const char* const sv[] = {"det", "och", "jag", "inte", "du", "vad", "hur", "som", "med", "har", "kan", "vill",
                                   "bor", "var", "vem", "vilken", "vilket", "ett", "att", "hej", "tack", "nej", "ja",
                                   "personer", "finns", "blir", "kommer", "mig", "dig", "sluta", "lyssna", nullptr};
  static const char* const en[] = {"what", "what's", "how", "is", "the", "and", "you", "it", "it's", "of", "do", "does",
                                   "who", "where", "live", "lives", "people", "please", "can", "much", "many", "are",
                                   "population", "tell", "me", "look", "up", "that's", "there", "this", "but", nullptr};
  if (!text) return Unknown;
  int s = 0, e = 0;
  char word[24]; size_t n = 0;
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text);; ++p) {
    const unsigned char c = *p;
    // UTF-8 å ä ö Å Ä Ö = C3 A5/A4/B6/85/84/96
    if (c == 0xC3 && p[1] && strchr("\xA5\xA4\xB6\x85\x84\x96", p[1])) s += 2;
    const bool letter = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '\'';
    if (letter && n < sizeof(word) - 1) { word[n++] = (c >= 'A' && c <= 'Z') ? char(c + 32) : char(c); continue; }
    if (letter) continue;
    if (n) { word[n] = 0; if (inList(word, sv)) ++s; if (inList(word, en)) ++e; n = 0; }
    if (!c) break;
  }
  if (s == e) return Unknown;
  return s > e ? Swedish : English;
}
inline const char* instruction(Lang lang) {
  if (lang == Swedish) return "REPLY LANGUAGE: Swedish. The user asked this question in Swedish, so answer in Swedish even if the search query, results or memory are in English.";
  if (lang == English) return "REPLY LANGUAGE: English. The user asked this question in English, so answer in English even if the profile, memory or earlier turns are in Swedish.";
  return nullptr;
}
inline const char* name(Lang lang) { return lang == Swedish ? "sv" : lang == English ? "en" : "unknown"; }
}
