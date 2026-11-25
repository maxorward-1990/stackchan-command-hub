#pragma once
#include <ctime>
#include <cstring>
#include <cstdio>
namespace ClockPolicy {
inline bool valid(std::time_t epoch) { return epoch >= 1704067200 && static_cast<long long>(epoch) < 4102444800LL; }
inline int lastSunday(const std::tm& utc, int daysInMonth) {
  return daysInMonth - (utc.tm_wday + daysInMonth - utc.tm_mday) % 7;
}
inline bool stockholmSummer(const std::tm& utc) {
  if (utc.tm_mon < 2 || utc.tm_mon > 9) return false;
  if (utc.tm_mon > 2 && utc.tm_mon < 9) return true;
  const int sunday = lastSunday(utc, 31);
  const bool after = utc.tm_mday > sunday || (utc.tm_mday == sunday && utc.tm_hour >= 1);
  return utc.tm_mon == 2 ? after : !after;
}
inline bool offset(const char* zone, const std::tm& utc, int& minutes) {
  if (!zone) return false;
  if (!std::strcmp(zone, "UTC")) { minutes = 0; return true; }
  if (!std::strcmp(zone, "Europe/Stockholm")) { minutes = stockholmSummer(utc) ? 120 : 60; return true; }
  if (!std::strcmp(zone, "Asia/Tokyo")) { minutes = 540; return true; }
  if (!std::strcmp(zone, "Pacific/Port_Moresby")) { minutes = 600; return true; }
  return false;
}
inline bool format(std::time_t now, const char* zone, char* out, size_t size, int& minutes) {
  if (!valid(now)) return false;
  std::tm utc{}; gmtime_r(&now, &utc);
  if (!offset(zone, utc, minutes)) return false;
  std::time_t local = now + minutes * 60;
  std::tm parts{}; gmtime_r(&local, &parts);
  return std::strftime(out, size, "%Y-%m-%dT%H:%M:%S", &parts) > 0;
}
}
