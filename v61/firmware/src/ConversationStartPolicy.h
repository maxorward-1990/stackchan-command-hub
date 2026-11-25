#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
// Main-loop-only PCM queue. Never overwrite speech while TLS/setup is pending.
namespace ConversationStartPolicy {
constexpr size_t chunkSamples = 2000;
constexpr size_t chunks = 48; // 6 seconds, mono PCM16 at 16 kHz (192,000 bytes PSRAM); covers slow TLS.
constexpr uint32_t warmMs = 60000;
inline bool warmExpired(uint32_t now, uint32_t since) { return now - since >= warmMs; }
struct Queue {
  int16_t* pcm = nullptr;
  size_t head = 0, count = 0;
  void clear() { head = count = 0; }
  bool push(const int16_t* input) {
    if (!pcm || !input || count == chunks) return false;
    std::memcpy(pcm + ((head + count) % chunks) * chunkSamples, input, chunkSamples * sizeof(int16_t));
    ++count; return true;
  }
  const int16_t* front() const { return pcm && count ? pcm + head * chunkSamples : nullptr; }
  void pop() { if (count) { head = (head + 1) % chunks; --count; } }
};
}