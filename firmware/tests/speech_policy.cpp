#include "../src/SpeechPolicy.h"
#include <cassert>
#include <string>
int main() {
  using namespace SpeechPolicy;
  assert(validLanguages("sv-en") && validLanguages("sv") && validLanguages("en") && validLanguages("auto"));
  assert(!validLanguages("zh") && !validLanguages(nullptr));
  const std::string dual = languageInstruction("sv-en");
  assert(dual.find("in Swedish to Swedish") != std::string::npos);
  assert(dual.find("in English to English") != std::string::npos);
  assert(dual.find("latest utterance alone") != std::string::npos);  // v80
  assert(dual.find("Default to Swedish") == std::string::npos);

  assert(std::string(languageInstruction("en")).find("English speech only") != std::string::npos);
  assert(sampleRate == 16000 && seconds == 3 && samples == 48000 && pcmBytes == 96000);
  assert(chunkFits(0, 768, pcmBytes));
  assert(chunkFits(pcmBytes - 2, 2, pcmBytes));
  assert(!chunkFits(pcmBytes, 2, pcmBytes));
  assert(!chunkFits(0, 769, pcmBytes));
}