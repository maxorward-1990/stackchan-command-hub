#pragma once
#include <ArduinoJson.h>
#include <cstdint>
#include <cstddef>
#include <string>
namespace LiveSessionPolicy {
inline constexpr uint32_t toolDeadlineMs = 70000;
inline constexpr uint32_t replyDeadlineMs = 30000;
// v65: a manually ended voice turn with no reply gives up quickly instead of a frozen thinking face.
inline constexpr uint32_t tapReplyDeadlineMs = 10000;
inline uint32_t replyDeadline(bool tapTurn) { return tapTurn ? tapReplyDeadlineMs : replyDeadlineMs; }
inline constexpr uint32_t playbackDeadlineMs = 5000;
// v31: a USB/text turn with no audio or tool call after this long is re-sent once.
inline constexpr uint32_t textRetryMs = 10000;
inline bool shouldRetryText(bool active, bool retried, uint32_t now, uint32_t sentMs) {
  return active && !retried && sentMs && static_cast<uint32_t>(now - sentMs) >= textRetryMs;
}
inline constexpr size_t maxMessageBytes = 192 * 1024;
// generationComplete ends generation, not the server turn or speaker playback.
inline bool turnComplete(JsonVariantConst content) {
  return content["turnComplete"].is<bool>() && content["turnComplete"].as<bool>();
}
inline bool audioPart(JsonVariantConst part) {
  const char* mime = part["inlineData"]["mimeType"] | "";
  const char* data = part["inlineData"]["data"] | "";
  return std::string(mime).compare(0, 9, "audio/pcm") == 0 && data[0] != '\0';
}
inline bool captureReady(bool queued, size_t pendingCaptures) {
  return queued && pendingCaptures == 0;
}
inline bool canResume(bool recording, bool speaking, bool playing, bool toolPending) {
  return !recording && !speaking && !playing && !toolPending;
}
inline bool expired(uint32_t now, uint32_t start, uint32_t limit) {
  return start != 0 && static_cast<uint32_t>(now - start) >= limit;
}
}