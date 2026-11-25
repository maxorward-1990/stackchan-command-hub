#pragma once
// Pure rules for the on-robot menu carousel: horizontal swipes change page,
// small movements are taps, title-bar zones give non-swipe navigation.
namespace MenuPagerPolicy {
constexpr int kW = 320, kTitleH = 32, kSwipePx = 60, kTapSlopPx = 20;
enum class Gesture { None, Tap, Prev, Next, Close };
inline int absi(int v) { return v < 0 ? -v : v; }
inline Gesture classify(int x0, int y0, int x1, int y1) {
  const int dx = x1 - x0, adx = absi(dx), ady = absi(y1 - y0);
  if (adx >= kSwipePx && adx > ady) return dx < 0 ? Gesture::Next : Gesture::Prev;  // finger left = next page
  if (y1 - y0 >= kSwipePx && ady > adx) return Gesture::Close;  // finger down closes the menu from any page
  if (adx <= kTapSlopPx && ady <= kTapSlopPx) return Gesture::Tap;
  return Gesture::None;  // diagonal/short drags do nothing rather than guessing
}
inline int step(int page, int count, Gesture g) {
  if (count <= 0) return 0;
  if (page < 0 || page >= count) page = 0;
  if (g == Gesture::Next) return (page + 1) % count;
  if (g == Gesture::Prev) return (page + count - 1) % count;
  return page;
}
enum class Title { None, Prev, Next, Close };
inline Title titleHit(int x, int y) {
  if (y < 0 || y >= kTitleH) return Title::None;
  if (x < 50) return Title::Prev;
  if (x >= kW - 64) return Title::Close;  // wider close target (v71)
  if (x >= kW - 124) return Title::Next;
  return Title::None;
}
}  // namespace MenuPagerPolicy
