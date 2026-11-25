#pragma once
#include <cstddef>
namespace LiveSetupPolicy {
inline constexpr size_t activeMemoryBytes = 2000;
inline constexpr size_t instructionBytes = 24576;
inline constexpr size_t packetBytes = 49152;
inline bool validPacket(size_t bytes) { return bytes > 0 && bytes <= packetBytes; }
}