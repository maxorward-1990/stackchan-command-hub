#pragma once
#include <cstdint>

// Protected by the owning module's mutex, never accessed unsynchronized.
class AsyncToolState {
 public:
  bool start(uint32_t& token) {
    if (running_) return false;
    running_ = true;
    ready_ = false;
    token = ++generation_;
    return true;
  }
  bool complete(uint32_t token) {
    running_ = false;
    ready_ = token == generation_;
    return ready_;
  }
  void dispatchFailed() { running_ = false; ready_ = false; }
  void cancel() { ++generation_; ready_ = false; }
  bool take() { bool value = ready_; ready_ = false; return value; }
  bool busy() const { return running_; }
 private:
  uint32_t generation_ = 0;
  bool running_ = false;
  bool ready_ = false;
};