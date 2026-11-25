#pragma once
#include <cstddef>
#include <cstdint>
// v38: Gemini Live WebSocket/TLS runs in a core-0 task; the main loop only
// consumes copied messages. Pure bounds so the handoff is tested off-device.
namespace WsTransportPolicy {
inline constexpr size_t inQueueLen = 32;        // received messages waiting for the main loop
inline constexpr size_t outQueueLen = 24;       // outgoing messages waiting for the network task
inline constexpr size_t maxEventsPerLoop = 4;   // keep display/touch responsive under a backlog
inline constexpr size_t maxSendsPerPass = 8;
inline constexpr uint32_t enqueueTimeoutMs = 2000;
inline constexpr uint32_t taskStackBytes = 12288; // TLS handshake + frame reads
inline constexpr int taskCore = 0;
// Stop consuming when the speaker FIFO is nearly full: backpressure then stays
// in the network task instead of blocking the main loop.
inline bool shouldDrain(size_t processed, int fifoCount, int ringSlots) {
  return processed < maxEventsPerLoop && fifoCount < ringSlots - 3;
}
// Heartbeat frames carry nothing the main loop needs.
inline bool forward(bool isPingOrPong) { return !isPingOrPong; }
}
