#include "TalkTouchPolicy.h"
#pragma once
#include <Arduino.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <M5StackChan.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include "GeminiToolBridge.h"
#include "EmotionController.h"
#include "ConversationStartPolicy.h"
#include "SearchHandoffPolicy.h"

class MemoryStore;

// Compile-only Gemini Live skeleton for StackChan-BSP-based firmware.
// Secrets are intentionally not embedded here. Tomorrow this should load
// Wi-Fi/API key/system prompt from SD/NVS, with redacted serial logs.
class GeminiLiveProbe {
 public:
  static constexpr int AUDIO_RING_BUFFERS = 64;  // v38: ~3 MiB PSRAM, absorbs hotspot jitter
  static constexpr size_t AUDIO_BUFFER_BYTES = 48 * 1024;

  bool begin(const char* api_key);
  bool connect();
  void disconnect(bool intentional = true, const char* finalEmotion = nullptr);
  void setToolBridge(GeminiToolBridge* bridge) { tool_bridge_ = bridge; }
  void setEmotionController(EmotionController* emotion) { emotion_ = emotion; }
  void setMemoryStore(MemoryStore* memory) { memory_ = memory; }
  void setSpeakerVolume(uint8_t volume) { speaker_volume_ = volume; }
  void setVadConfig(uint16_t prefixPaddingMs, uint16_t silenceDurationMs,
                    bool startSensitivityHigh, bool endSensitivityLow,
                    bool turnIncludesAllInput);
  uint16_t vadPrefixPaddingMs() const { return vad_prefix_padding_ms_; }
  uint16_t vadSilenceDurationMs() const { return vad_silence_duration_ms_; }
  bool vadStartSensitivityHigh() const { return vad_start_sensitivity_high_; }
  bool vadEndSensitivityLow() const { return vad_end_sensitivity_low_; }
  bool vadTurnIncludesAllInput() const { return vad_turn_includes_all_input_; }
  void setModel(const String& model) { if (model.length()) model_ = model; }
  void setVoiceName(const String& voiceName) { if (voiceName.length()) voice_name_ = voiceName; }
  void setSpeechLanguages(const String& languages) { speech_languages_ = languages; }
  const String& speechLanguages() const { return speech_languages_; }
  void setSystemPrompt(const String& systemPrompt) { system_prompt_ = systemPrompt; system_prompt_.trim(); }
  void setPersonaPrompt(const String& personaPrompt) { persona_prompt_ = personaPrompt; persona_prompt_.trim(); }
  void loop();
  void sendSetup();
  void sendTextTurn(const String& text);
  bool requestTextTurn(const String& text);
  bool sendImageTurn(const String& imageBase64, const String& prompt);
  void streamAudioDeltaBase64(const String& b64);
  bool isReady() const { return connected_ && setup_complete_; }
  bool isConnecting() const { return connect_requested_ && !setup_complete_; }
  bool isRecording() const { return realtime_recording_; }
  bool isSpeaking() const { return speaking_; }
  bool continuousConversation() const { return continuous_conversation_; }
  bool isMicReadyForSpeech() const { return mic_ready_for_speech_; }
  uint16_t lastMicRms() const { return last_mic_rms_; }
  uint16_t lastMicPeak() const { return last_mic_peak_; }
  uint16_t turnPeakRms() const { return turn_peak_rms_; }
  uint32_t micChunksSent() const { return mic_chunks_sent_; }
  uint32_t micRecordFalseCount() const { return mic_record_false_count_; }
  uint32_t audioChunksPlayed() const { return audio_chunks_; }
  uint32_t audioChunksDropped() const { return audio_dropped_; }
  uint32_t audioBackpressureWaitMs() const { return audio_backpressure_wait_ms_; }
  uint32_t queuedAudioMs() const { return queuedAudioSamples() / 24; }
  uint32_t audioUnderruns() const { return audio_underruns_; }
  const String& lastError() const { return last_error_; }
  const String& lastTool() const { return last_tool_; }
  bool toolPending() const { return search_handoff_.waiting() || pending_search_id_.length() || pending_internet_id_.length() || pending_motion_response_.length() || queued_tools_.size(); }
  bool canInterrupt() const { return user_turn_end_pending_ || speaking_ || M5.Speaker.isPlaying(1) || audioFifoCount() || toolPending() || awaiting_reply_ms_; }
  void setContinuousConversation(bool enabled) { continuous_conversation_ = enabled; }
  bool requestConversationStart();
  void stopConversation();
  void requestInterrupt();
  bool pollTouchInterrupt();
  bool consumeInterruptTouch() { bool value = interrupt_touch_consumed_; interrupt_touch_consumed_ = false; return value; }
  bool interrupt_touch_consumed_ = false;
  bool interrupt_pending_ = false;
  bool discard_audio_ = false;
  bool interrupt_touch_down_ = false;
  void requestSessionEnd(const String& reason = "");
  void startRealtimeRecord();
  void stopRealtimeRecord();
  // v29: user tapped to finish speaking; stop mic and ask Gemini to answer now.
  bool endUserTurn();
  void toggleRealtimeRecord();

 private:
  static constexpr int RT_REC_SAMPLE_RATE = 16000;
  static constexpr int RT_REC_SAMPLES = 2000;  // 0.125s at 16 kHz, copied from working realtime path.
  static constexpr uint32_t REALTIME_RECORD_TIMEOUT_MS = 30000;
  static constexpr uint32_t IDLE_DISCONNECT_MS = ConversationStartPolicy::warmMs;
  static constexpr uint32_t CONNECT_TIMEOUT_MS = 20000;
  static constexpr uint32_t CONTINUOUS_CONVERSATION_TIMEOUT_MS = 150000;
  static constexpr uint32_t CONTINUOUS_RECORD_WATCHDOG_MS = 2500;
  static constexpr uint32_t END_SESSION_GRACE_MS = 12000;

  WebSocketsClient ws_;
  // v38: ws_ is only touched by the core-0 network task (and connect/disconnect under ws_mutex_).
  struct WsMsg { WStype_t type; uint8_t* data; size_t len; };
  QueueHandle_t ws_in_ = nullptr, ws_out_ = nullptr;
  SemaphoreHandle_t ws_mutex_ = nullptr;
  TaskHandle_t ws_task_ = nullptr;
  volatile bool ws_run_ = false;
  volatile uint32_t ws_in_dropped_ = 0, ws_out_failed_ = 0;
  uint32_t ws_out_failed_seen_ = 0, ws_in_dropped_seen_ = 0;
  static void wsTask(void* arg);
  void processWsEvent(WStype_t type, uint8_t* payload, size_t length);
  void drainWsEvents();
  void clearWsQueues(bool processDisconnect);
  bool wsSend(const char* data, size_t len);
  bool wsSend(const String& s) { return wsSend(s.c_str(), s.length()); }
  uint8_t* audio_buf_[AUDIO_RING_BUFFERS] = {nullptr};
  int16_t* rec_buf_ = nullptr;
  ConversationStartPolicy::Queue input_queue_;
  bool user_turn_end_pending_ = false;
  TalkTouchPolicy::SilenceTail turn_silence_tail_;
  bool warm_idle_ = false;
  uint32_t warm_started_ms_ = 0, touch_start_ms_ = 0;
  void drainInputAudio();
  void finishUserTurn();
  void enterWarmIdle();
  int next_audio_buf_ = 0;
  struct AudioFifoEntry { int buf; size_t samples; };
  AudioFifoEntry audio_fifo_[AUDIO_RING_BUFFERS] = {};
  int audio_fifo_head_ = 0, audio_fifo_tail_ = 0;
  int audioFifoCount() const { return (audio_fifo_tail_ - audio_fifo_head_ + AUDIO_RING_BUFFERS) % AUDIO_RING_BUFFERS; }
  void pumpAudio();
  size_t queuedAudioSamples() const;
  void handleToolCalls(JsonArray functionCalls);
  void dispatchQueuedTool();
  JsonDocument queued_tools_;
  String pending_motion_response_;
  uint32_t motion_started_ms_ = 0, motion_settled_ms_ = 0;
  uint32_t audio_prefill_started_ms_ = 0;
  uint32_t audio_underruns_ = 0;
  size_t audio_peak_samples_ = 0;
  size_t last_speaker_slots_ = 0;
  bool audio_prefilling_ = true;
  bool audio_restarting_ = false;
  bool connected_ = false;
  bool setup_complete_ = false;
  bool realtime_recording_ = false;
  bool speaking_ = false;
  bool continuous_conversation_ = false;
  bool configured_ = false;
  bool connect_requested_ = false;
  bool intentional_disconnect_ = false;
  bool pending_start_recording_ = false;
  bool pending_text_turn_ = false;
  bool resume_conversation_after_text_ = false;
  bool mic_ready_for_speech_ = false;
  bool listening_cue_pending_ = false;
  bool end_session_requested_ = false;
  uint32_t record_started_ms_ = 0;
  uint32_t last_activity_ms_ = 0;
  uint32_t connect_started_ms_ = 0;
  uint32_t stopped_recording_ms_ = 0;
  uint32_t end_session_requested_ms_ = 0;
  uint32_t audio_chunks_ = 0;
  uint32_t audio_dropped_ = 0;
  uint32_t audio_backpressure_wait_ms_ = 0;
  uint16_t last_mic_rms_ = 0;
  uint16_t turn_peak_rms_ = 0;      // loudest chunk since listening started (v30)
  uint32_t turn_started_ms_ = 0;    // when the request was sent, for [TID] timing lines
  bool first_audio_logged_ = false;
  String last_text_;               // v31: text turn kept for one retry
  bool text_turn_active_ = false;  // text sent, no audio/tool yet (touch locked)
  bool text_retry_done_ = false;
  uint16_t last_mic_peak_ = 0;
  uint32_t mic_chunks_sent_ = 0;
  uint32_t mic_record_false_count_ = 0;
  bool mic_capture_pending_ = false;
  bool turn_complete_pending_ = false;
  uint32_t mic_capture_started_ms_ = 0;
  uint32_t playback_drain_started_ms_ = 0;
  uint32_t pending_tool_started_ms_ = 0;
  uint32_t awaiting_reply_ms_ = 0;
  String last_error_, last_tool_;
  uint8_t* fragment_buffer_ = nullptr;
  size_t fragment_size_ = 0;
  uint8_t speaker_volume_ = 200;
  uint16_t vad_prefix_padding_ms_ = 800;
  uint16_t vad_silence_duration_ms_ = 900;
  bool vad_start_sensitivity_high_ = true;
  bool vad_end_sensitivity_low_ = true;
  bool vad_turn_includes_all_input_ = true;
  String api_key_storage_;
  String model_ = "models/gemini-3.1-flash-live-preview";
  String voice_name_ = "Puck";
  String speech_languages_ = "sv-en";
  String system_prompt_;
  String persona_prompt_;
  String intentional_disconnect_emotion_ = "neutral";
  String pending_text_;
  String pending_search_id_;
  String pending_search_name_;
  SearchHandoffPolicy::Gate search_handoff_;
  String handoff_query_;
  bool handoff_resume_voice_ = false;
  uint8_t* handoff_packet_ = nullptr;
  size_t handoff_packet_size_ = 0;
  bool buildSearchAnswer(const String& result);
  void sendSearchAnswer();
  String pending_internet_id_;
  String pending_internet_name_;
  String transcript_output_buffer_;
  const char* api_key_ = nullptr;
  GeminiToolBridge* tool_bridge_ = nullptr;
  EmotionController* emotion_ = nullptr;
  MemoryStore* memory_ = nullptr;

  static GeminiLiveProbe* self_;
  static void wsEvent(WStype_t type, uint8_t* payload, size_t length);
  void handleMessage(uint8_t* payload, size_t length);
  void handleTranscription(JsonVariant serverContent);
  void appendOutputTranscriptChunk(const char* text);
  void flushOutputTranscript();
  void recordAndSendAudioChunk();
  void playListeningChirp();
  bool sendRealtimeAudioBase64(const String& b64);
  void finishTurn();
  void receiveFragment(uint8_t* payload, size_t length, bool first, bool final);
  String encodeBase64(const uint8_t* input, size_t size);
  int decodeBase64(const char* input, int size, char* output);
};
