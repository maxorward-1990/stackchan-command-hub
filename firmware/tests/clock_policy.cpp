#include "../src/ClockPolicy.h"
#include <cassert>
#include <string>
int main() {
  int offset; char out[32];
  assert(ClockPolicy::format(1795456440, "Europe/Stockholm", out, sizeof(out), offset));
  assert(std::string(out) == "2026-11-23T18:54:00" && offset == 60);
  assert(ClockPolicy::format(1795456440, "Asia/Tokyo", out, sizeof(out), offset));
  assert(std::string(out) == "2026-11-24T02:54:00" && offset == 540);
  assert(ClockPolicy::format(1795456440, "Pacific/Port_Moresby", out, sizeof(out), offset));
  assert(std::string(out) == "2026-11-24T03:54:00" && offset == 600);
  assert(!ClockPolicy::format(0, "UTC", out, sizeof(out), offset));
  assert(!ClockPolicy::format(1795456440, "unknown", out, sizeof(out), offset));
  std::tm utc{}; utc.tm_mon = 2; utc.tm_mday = 29; utc.tm_wday = 0; utc.tm_hour = 0;
  assert(!ClockPolicy::stockholmSummer(utc)); utc.tm_hour = 1; assert(ClockPolicy::stockholmSummer(utc));
  utc.tm_mon = 9; utc.tm_mday = 25; utc.tm_wday = 0; utc.tm_hour = 0;
  assert(ClockPolicy::stockholmSummer(utc)); utc.tm_hour = 1; assert(!ClockPolicy::stockholmSummer(utc));
}
