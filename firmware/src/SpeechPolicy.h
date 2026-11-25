#pragma once
#include <cstring>
#include <cstddef>
#include <cstdint>
namespace SpeechPolicy {
inline bool validLanguages(const char* value) {
  return value && (!strcmp(value, "sv-en") || !strcmp(value, "sv") || !strcmp(value, "en") || !strcmp(value, "auto"));
}
inline const char* languageInstruction(const char* value) {
  if (value && !strcmp(value, "sv")) return "The conversation language is Swedish; reply in Swedish. Accept English technical loanwords inside Swedish sentences (flasha, memory-t, reboot, setup). A loanword alone is not a language switch. Do not invent words from noise; if unclear, ask briefly in Swedish.";
  if (value && !strcmp(value, "en")) return "Accept English speech only and reply in English. Do not interpret noise as another language. If unclear, ask briefly in English.";
  if (value && !strcmp(value, "auto")) return "Reply in the language of the user's current utterance. Treat noise and silence as noise, not words.";
  return "Only Swedish and English are expected. Reply in Swedish to Swedish speech and in English to English speech. Swedish sentences may contain English technical loanwords (flasha, memory-t, reboot, setup); these words alone must not change the reply language. Follow the language of the current sentence, not old history, search results or the place mentioned. Default to Swedish when uncertain. Treat noise as noise and ask briefly if speech is unclear instead of inventing words.";
}
constexpr size_t sampleRate = 16000;
constexpr size_t seconds = 3;
constexpr size_t samples = sampleRate * seconds;
constexpr size_t pcmBytes = samples * 2;
constexpr size_t chunkBytes = 768;
constexpr uint32_t captureTimeoutMs = 1500;
inline bool chunkFits(size_t offset, size_t count, size_t total) {
  return count > 0 && count <= chunkBytes && offset < total && count <= total - offset;
}
}