#pragma once
#include <vector>
struct TestMove { int x, y, speed; };
struct TestMotion {
  std::vector<TestMove> moves;
  void move(int x, int y, int speed) { moves.push_back({x, y, speed}); }
  void stop() {}
};
struct TestStackChan { TestMotion Motion; };
inline TestStackChan M5StackChan;