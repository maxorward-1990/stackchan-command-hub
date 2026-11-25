#pragma once
#include <ArduinoJson.h>
#include <esp_heap_caps.h>
#include <cstring>

// Setup-only allocation: never fall back to TLS's scarce internal heap.
class LiveSetupAllocator : public ArduinoJson::Allocator {
 public:
  void* allocate(size_t size) override {
    return heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  }
  void deallocate(void* ptr) override { heap_caps_free(ptr); }
  void* reallocate(void* ptr, size_t size) override {
    return heap_caps_realloc(ptr, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  }
};

class LiveSetupText {
 public:
  explicit LiveSetupText(size_t capacity)
      : data_(static_cast<char*>(heap_caps_malloc(capacity + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT))),
        capacity_(capacity), ok_(data_ != nullptr) { if (data_) data_[0] = 0; }
  ~LiveSetupText() { heap_caps_free(data_); }
  LiveSetupText(const LiveSetupText&) = delete;
  LiveSetupText& operator=(const LiveSetupText&) = delete;
  LiveSetupText& operator+=(const char* text) {
    if (!ok_ || !text) { ok_ = false; return *this; }
    const size_t n = std::strlen(text);
    if (n > capacity_ - length_) { ok_ = false; return *this; }
    std::memcpy(data_ + length_, text, n + 1);
    length_ += n;
    return *this;
  }
  bool ok() const { return ok_; }
  char* data() { return data_; }
  const char* c_str() const { return data_ ? data_ : ""; }
 private:
  char* data_;
  size_t capacity_;
  size_t length_ = 0;
  bool ok_;
};