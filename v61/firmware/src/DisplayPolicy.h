#pragma once
#include <cstddef>
#include <cmath>
namespace DisplayPolicy {
constexpr size_t maxTitle = 80;
constexpr size_t maxText = 2400;
constexpr size_t maxItems = 6;
constexpr int panelHeight = 70;
constexpr size_t panelLines = 3;
constexpr size_t maxPanelLines = 90;
constexpr unsigned pageMs = 4000;
inline size_t pageIndex(unsigned elapsedMs, size_t lineCount) {
  size_t pages = (lineCount + panelLines - 1) / panelLines;
  return pages ? (elapsedMs / pageMs) % pages : 0;
}
inline bool textFits(size_t title, size_t text) {
  return title <= maxTitle && text > 0 && text <= maxText;
}
inline bool barValue(double value) { return std::isfinite(value) && value >= 0 && value <= 100; }
}