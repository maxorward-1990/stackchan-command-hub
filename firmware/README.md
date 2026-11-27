# StackChan Gemini — custom v84 (källträd)

Sedan 2026-11-27 är den här mappen firmwarekällan som byggs: v84, fryst fil för fil från
`history/prepare_apps.py` (v61 + overlays v66–v84). Ändra direkt i `src/`, lägg tester i
`tests/` och kör `bash firmware/run_tests.sh`. Bygg: kopiera mappen till t.ex.
`/tmp/stackchan-build` och kör `PLATFORMIO_CORE_DIR=/tmp/stackchan-pio-core pio run -d /tmp/stackchan-build`
(GitHub-workflowet Bygg firmware gör samma sak). Versionsnoteringar för v66–v84 finns i `history/`;
avsnitten nedan är v61-källans ursprungliga noteringar.

## v86 — appar som pratar direkt efter ett röstkommando
- v85 startade appen samtidigt som samtalet stängdes; Gemini svarade då "Disco!" som text utan ljud. Appen väntar nu 1,5 s efter samtalet, och ett tal-steg som slutar utan ljud provas en gång till innan appen stoppas med felet "Gemini svarade utan ljud". Loggen visar `[TUR] klar utan ljud` när en tur saknar ljud.

## v85 — egna appar på roboten
- Appar från Command Hubs appbyggare (format v1) skickas till roboten (`/api/robotapps`, bilder i delar) och körs där utan dator: start från menyn (Mina appar), rösten (Gemini-verktyget `start_app`, "starta appen …") eller automatiskt på klockslag, närhet, ljus, huvudtryck eller ett ord användaren säger.
- Steg: LED, ansikte, gest/dans, titta, text, bild, säg, fråga Gemini, lampor, att-göra, timer, vänta, avsluta samtal, återställ. En app i taget; starten väntar tills roboten är ledig.
- SD-kort: mappen `stackchan-apps` (exporteras från Command Hub) läses in från menyn; sätt i kortet efter start och ta ut det efteråt.
- Oförändrat: partitioner, lagring, röst-/minnesvägar. +1,4 kB statiskt internminne jämfört med v84.

# StackChan Gemini — custom v61

## v61 — correlated host test capture and fresh clock reads
- Command Hub Felsökning: permit local conversation-text collection, then Starta test
  enables acknowledged telemetry and collects USB events, transcripts, timings and
  start/end safe status snapshots. Stoppa och spara restores prior telemetry and
  downloads one JSON report. Browser RAM only: 30 min / 20000 events / 4 MiB event
  budget, omitted counts; no PCM, camera capture, old/private memory or upload.
- Requires v61 for shared authenticated GET/POST /api/performance. Existing
  PerfMonitor frequency/nonblocking output is unchanged; no robot log buffer added.
- get_current_time reads the device clock on demand: UTC, Stockholm (EU DST), Tokyo,
  Port Moresby. Reports invalid clocks/unknown zones, and network-sync status;
  setup timestamp is explicitly not a live clock. RTC fallback can drift.
- Swedish sentences accept English technical loanwords without treating each
  loanword as a language switch. This is model guidance, not guaranteed recognition.
- Clear pending click completion and digital silence on stop, response, new session
  and playback completion. The existing 150-second per-listening-period timeout is
  not a verified silence detector; no claim of a new inactivity threshold.
- Host policy tests and simulated USB capture do not verify physical wake-word,
  language recognition, real NTP sync or long-run robot stability. v60 retained.

## v60 — neutral head on explicit stop, conservative idle memory guard
- Shared explicit stop (touch/USB/HTTP) cancels motion and queues absolute center_head
  (yaw 0, pitch 120); wake-word capture waits until this motion completes.
- Idle-only guard releases WakeNet working memory after internal free <20 KiB OR
  largest block <8 KiB persists 5 seconds. Wake resumes after 2 seconds; action
  cooldown 5 minutes. Camera/menu/diagnostics/network workers/Live/motion defer it.
- [MEMGUARD] reports before/after actual memory; no reboot, flash writes, claimed
  heap compaction or leak cure. Observed 12 KiB largest blocks alone do not trigger it.
- Hardware follow-up: look up, hold to stop, verify home then wake; repeat searches
  and conversations for 30 minutes. v59 retained as rollback.

## v59 — deliberate holds and reliable tap-to-finish
- Listening taps (including mic startup and quiet speech) request input completion; a
  1000 ms hold ends the session with a neutral face. Idle swipe menu is unchanged.
- Complete captured PCM and drain queued speech first, then send a bounded digital
  silence tail (VAD duration + 300 ms, max 2000 ms) at 125 ms intervals followed by
  Google's valid `audioStreamEnd`. No synchronous delay or packet burst; cancel the
  tail when the server already answers, or on stop/disconnect.
- This is a mitigation for observed no-reply turns, not proof of a Google protocol bug.
  The prior claim that `audioStreamEnd` does not exist was incorrect.
- Hardware validation required: tap during startup, speak then tap, quiet speech,
  hold >=1 s, wake again, voice search then tap after playback. Collect USB logs.

## v58 — swipe menu, forgiving gestures
- On-device menu opens only on an idle upward swipe (`TouchMenuPolicy::isSwipeUp`, >=60 px,
  mostly vertical); idle holds are ignored, holds during a conversation still end it.
- `servo_gesture` names pass through pure tested `GestureAliasPolicy.h`; unknown names map
  to a real gesture (fallback `curious_tilt`) and report `aliased_from`, never `unknown_gesture`.
- Test: `tests/touch_menu_policy.cpp`, `tests/gesture_alias_policy.cpp` plus all regressions.


Upstream: taranton/stackchan-gemini-firmware, commit 6c00ab82134a (MIT).

## v57 — TLS buffers in PSRAM
- Root cause from v56 hardware log: search succeeded (HTTP 200) but every later TLS
  handshake failed with -32512 although internal_free was ~67 KiB. The prebuilt core
  sets CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC, so each handshake needs two ~16.7 KiB internal
  record buffers; fragmentation after search/WakeNet left only one such block.
- `TlsAllocator::install()` (first in setup) calls `mbedtls_platform_set_calloc_free`:
  blocks > 512 B go to PSRAM first, smaller ones internal first, each with one fallback
  (pure tested `TlsAllocPolicy.h`). Covers Gemini Live, Tavily, Tuya and Wikimedia.
  Certificate verification unchanged; no `setInsecure()`.
- `safeMicEnd()` no longer unsubscribes IDLE0 from the task watchdog (IDF 5 idle hook
  logged "esp_task_wdt_reset: task not found"); the 3 s rescue timer still precedes the 5 s TWDT.
- Logs: `[TLS] allocator=psram_large` at boot; `[TLS] phase=...` with live PSRAM/internal
  TLS bytes, fallbacks and failures next to `[SEARCH]` and Live setup lines.
- Test: `g++ -std=c++17 tests/tls_alloc_policy.cpp -o /tmp/tlsp && /tmp/tlsp` plus all
  regressions. Same partitions/model/LittleFS; v49 rollback untouched. Hardware unverified.

## v56 — sequential, certificate-verified web search
- Every Tavily entry (voice, raw USB `search`, HTTP/BLE search test) runs the same
  main-loop preparation before worker reservation: stop/drain/destroy WakeNet,
  close Live under its transport mutex, discard old network/audio/tool queues,
  stop the speaker. The worker keeps its PSRAM stack/JSON and verified CA roots.
  No `setInsecure()`, TLS-buffer-size claims or guaranteed memory savings.
- Voice searches dispatch on the following loop, not inside frame processing.
  On completion, reconnect Live and send one completed user turn with the requested
  search and clearly marked untrusted results, bounded to 12 KiB result / 16 KiB packet
  in PSRAM. This is a NEW session, not protocol-level pause/resumption: latest local
  dialogue context reloads, but unfinished queued old-session tools are discarded.
  Never send a tool response with an old-session ID. Errors are passed honestly;
  successful data requires `searched_web=true`. No duplicate search/text retry while
  this answer is pending. Listening resumes only after turn completion/speaker drain.
- Stop, disconnect, interruption, bad/oversized result or reconnect failure cancels
  continuation and frees its packet. A cancelled worker finishes its bounded request;
  new Live/wake listening waits for it to finish so TLS owners cannot overlap.
  Text/USB connection starts also release WakeNet; wake cannot reload during connection.
- USB console recognizes raw firmware command verbs (`search`, `status`, `api`, etc.);
  other text remains a Gemini question. Explicit `say` is never prefixed twice.
- Logs: `[SEARCH] phase=owners_released`, `live_closed_searching`, worker heap readings,
  `reconnecting_with_result`, `result_turn_sent bytes=...`; no added query/key/content logs.
- Tests: all C++ policies including `search_handoff_policy.cpp`, wake lifecycle,
  setup/search PSRAM helpers, plus Command Hub regression tests. Same qio_qspi,
  partitions/model/LittleFS and untouched v49 rollback; no erase.
- Hardware is NOT available here. Flash v56, power-cycle, run `search gotland` in
  USB-logg while wake is enabled, then five voice searches and a follow-up question;
  end one search with a long press, wait for completion and ask a normal question.
  Send the complete log. Repeated real Tavily TLS success, reconnection latency,
  spoken answer/context fidelity and physical touch/audio still need this validation.

## v55 — Tavily worker memory during Live
- Use IDF's capability-aware task API for the unchanged 24 KiB worker stack,
  explicitly in PSRAM (SDK enables external stacks); no internal fallback.
  The worker performs network/RAM operations only, never flash/NVS writes.
- Response JSON, output JSON and bounded serialized scratch buffers also use the
  PSRAM-only allocator. Reject oversized (>48 KiB), incomplete or allocation-failed
  responses. Output is bounded to 12 KiB. Local objects are destroyed after each
  request, including cancellation; one worker is reused, sleeping on notifications.
  Its 24 KiB PSRAM stack stays allocated after first search. No self-delete: IDF's
  capability-aware self-deletion allocates an internal cleanup task and can abort
  under the very memory pressure this fix addresses.
- `[SEARCH]` logs dispatch, pre-HTTPS and completion heap readings, plus task
  allocation failure. No queries, keys or provider text in these added diagnostics.
- This removes the 24 KiB internal-stack allocation; it does NOT change the SDK's
  internal TLS allocator or guarantee two TLS connections fit. The earlier log
  shows insufficient room for that stack, but no measured heap at search dispatch.
  Real TLS success and external-stack compatibility require hardware validation.
- Same qio_qspi, model, partitions, settings and original v49 rollback. No erase.
  Flash, power-cycle, run five wake/search/end cycles and an interrupted search,
  then a normal question and lamp command; send the full USB log.
- Test `python3 tests/web_research_memory.py` plus all existing regressions.

## v54 — reduce Live setup internal-memory pressure
- Setup includes at most 2000 bytes of the latest redacted active dialogue; stored
  conversations are not deleted or rewritten. This reduces immediate recall, not storage.
- Setup JSON, tool JSON, the assembled instruction and serialized packet explicitly
  allocate in PSRAM without an internal-heap fallback. Bounded at 24 KiB instruction
  and 48 KiB serialized JSON; allocation/overflow/queue failures end cleanly with an error.
- `[SETUP]` logs only packet size and heap/free/largest-block readings, never prompts or keys.
  The v53 log establishes an AES allocation failure, not proof that history alone caused it.
  Compare these readings and `setupComplete` on the robot to validate the proposed fix.
- qio_qspi, model/table/LittleFS and v49 rollback unchanged. Flash without erase,
  power-cycle; test five wake/ask/end cycles, touch start, Tavily and a lamp command.
- Run all C++ tests and `python3 tests/wake_word_lifecycle.py`; the setup allocator
  regression is `python3 tests/live_setup_memory.py`. Hardware TLS/audio remains unverified here.

## v53 — correct v52 PSRAM boot regression
- Reverts memory mode to `qio_qspi`, as in v49/v51. The actual StackChan hardware log
  reports `board_M5StackChan`, octal PSRAM init failure and zero PSRAM in v52;
  the earlier generic CoreS3 OPI assumption was wrong for this robot.
- Before model discovery, verify external heap exists. With missing PSRAM, wake word
  stays unavailable for that boot, even if its saved toggle is on. Before create,
  also refuse zero free PSRAM. No unsafe model call, no mic start; saved settings untouched.
- Retains v52's model release before Gemini TLS and re-creation during idle, without clean().
  Logs total PSRAM at boot and internal/free/fragmentation at transitions.
- Host tests cover missing/exhausted PSRAM, zero model calls in that state, repeated
  handoffs and allocation failures; assert qio_qspi matches the v49 backup.
- Still requires physical validation: boot, Wi-Fi, five wake/ask/end cycles, touch start,
  Tavily and lamps. v52 is superseded: its hardware log confirmed a boot loop.
- Flash without erase; same model/table/LittleFS, v49 remains the rollback.

## v52 — wake-to-conversation memory handoff (superseded; wrong PSRAM mode)
- CoreS3 uses 8MB octal PSRAM: select `qio_opi` on Arduino 3; v49 backup is unchanged.
- Discover the model at boot but create its active instance only for idle listening.
  Stop/drain the microphone before destroying the instance and freeing all PCM buffers,
  including after detection, so Gemini TLS does not compete with an active WakeNet instance.
  No `clean()` call. Recreate on the next allowed idle period; failed allocations clean up
  completely and use the existing 30-second retry gate. Availability means discovered,
  not resident, to prevent the idle gate from permanently disabling reinitialization.
- `[WAKE] memory` logs report internal free/largest block and PSRAM at discovery,
  allocation and release. The v51 log proves TLS allocation failure, not its exact heap
  shortfall; these readings test the memory hypothesis on hardware. No guaranteed reload time.
- Same v50 table/model, LittleFS untouched, no erase, v49 binary/release preserved.
- Run `python3 tests/wake_word_lifecycle.py` plus all C++ policy tests. Hardware check:
  flash v52, power-cycle, wake/ask/end/repeat at least five times, then try touch start,
  a Tavily question and a lamp command. Export USB log including memory/start lines.
  Compilation/host tests do not verify PSRAM detection, real model destroy/recreate,
  TLS success, wake accuracy or audio on the robot.

## v51 — wake-word restart crash correction
- Removes the WakeNet `clean()` call on microphone start/resume. The v50 hardware
  backtrace points into the model reset path; no upstream/general bug claim is made.
- Model state is retained across pauses; newly captured PCM is still required before
  detection. No changes to the model, flash layout, saved toggle or conversation path.
- v51 includes the same v50 partition table/model for installations from v49 as well.
  Settings are not erased; the original v49 binary and release entry remain intact.
- Host lifecycle regression: `python3 tests/wake_word_lifecycle.py` compiles the actual
  WakeWord module against fakes and checks start, pause, resume, detection and mic failure.
- Hardware validation still required: boot with saved wake toggle on, leave idle,
  say "Hi Stack Chan", end the conversation and repeat; export the full USB log.

## v50 — local wake word "Hi Stack Chan" (superseded by v51)
- Platform: pioarduino 55.03.313 (Arduino 3 / IDF 5.5); `platformio.v49-backup.ini` rebuilds v49.
- `partitions_wake16MB.csv`: app1 shrunk to 5888K, new 512K `model` partition at 0xC10000; LittleFS stays
  at 0xC90000 (3456K), so settings survive. v49 app still runs with this table (rollback = flash v49 at 0x10000).
- Model: `srmodels.bin` packed with esp-sr `model/pack_model.py` from `wakenet_model/wn9_histackchan_tts3`
  only; Command Hub writes app 0x10000, table 0x8000, model 0xC10000 in one session, never erase.
- `wake_word` in `/personality.json` (default false). `[WAKE]` logs: ready/threshold, listening, paused,
  detected (threshold, detect_us, peak, listened_ms, release_ms). WakeNet exposes no per-detection score.
- Test: `g++ -std=c++17 tests/wake_word_policy.cpp -o /tmp/wwp && /tmp/wwp`. Not tested on hardware.

Build with PlatformIO: `pio run`. Target: M5Stack CoreS3 ESP32-S3,
16MB flash, default_16MB partitions. M5Unified 0.2.20 / M5GFX 0.2.36
are pinned for compatibility with the vendored StackChan BSP.

## v40 validation
- Command Hub → Styrning or Inställningar → Wi-Fi: enter a 2.4 GHz WPA/WPA2
  SSID and password. Prefer USB when changing networks. The shared client saves
  secrets first, checks the write result, then saves runtime and requests reboot.
  Credentials are not persisted in browser storage or shown in command summaries.
  Reconnect USB/BLE after reboot; network bridge users must update the robot IP.
- Motion threshold is 0.20 g (previously 0.45 g), still guarded by quiet time,
  debounce and own speaker/servo motion. Table transmission varies: this does not
  guarantee that every table knock is detectable. Upright recovery preserves
  listening/speaking/thinking state; setting down after lifting also emits Upright.
- Styrning → Två mikrofoner: explicit one-shot or ten finite captures, no automatic
  recording. The existing bounded stereo probe refuses active conversations,
  camera streams and audio diagnostics, and does not analyze timed-out buffers.
  RMS/peak/balance/delay/correlation can be exported locally as JSON; no PCM is
  returned or stored by this panel. L/R labels are codec channels, not calibrated
  physical direction or a speech-recognition accuracy test.
- Flash v40 at 0x10000 without erase and reconnect USB. Policy/build/browser
  checks do not establish physical Wi-Fi, knock sensitivity or stereo channel mapping.

## v21
- `speech_languages` in `/app/StackChan/config/runtime.json`: `sv-en` (default),
  `sv`, `en`, or `auto`. Command Hub → Inställningar → Talade språk edits this;
  save and start a new conversation. It overrides language directions in profiles
  and history without reflashing. Native Live uses model instructions, not a
  guaranteed speech-recognition language whitelist; misrecognitions remain possible.
- No sound during connection. Once Gemini setup completes, a short cue finishes
  before microphone capture begins (half-duplex hardware); LYSSNAR appears after
  the first captured chunk is sent. VÄNTA/SVARAR indicate other states. Automatic
  listening resumption after a reply stays silent.
- Text/lists retain the face with a 70px bottom panel, up to three lines per page,
  changing every four seconds. Validate all content before accepting it, and clear
  on new input transcription or session end. Charts and photos stay fullscreen.
- Explicit local mic test: POST `/api/audio/test` `{action:"start"}`, poll GET
  until `state:"ready"`, then POST `/api/audio/chunk` `{id,offset,count}` with
  count ≤768. Exactly 48000 mono PCM16 samples at 16kHz (three seconds), with the
  same current software gain/noise filter as Live. Stop the voice session first.
  Main-loop capture never sends audio to Google or writes it to storage. Timed RAM
  expiry (120s) and generation IDs prevent stale downloads. POST the test endpoint
  `{action:"clear",id}` to erase; the app clears after download. Command Hub exports
  a standard WAV and shows peak, RMS, gain/filter and near-clipping counts. No
  automatic recordings, no acoustic-quality or language-accuracy guarantees.
- `FirmwareVersion.h` supplies all on-device version labels.
- Firmware and policy tests do not validate physical audio/LCD/touch hardware.

Additional test: `g++ -std=c++17 tests/speech_policy.cpp -o /tmp/stackchan-speech-test && /tmp/stackchan-speech-test`.

## Changes
- Wait for asynchronous M5Unified microphone capture completion before reading PCM;
  count a sent chunk/listening cue only after a successful WebSocket send. Failures
  stop the session with a redacted error instead of silently claiming to listen.
- Handle every PCM part and bounded fragmented Live messages, not just parts[0].
  Only boolean `turnComplete:true` ends a turn; `generationComplete` does not.
  Drain voice playback from the main loop while still servicing WebSocket/HTTP/touch.
- Prevent mic restart during pending tools/replies; bound worker waits to 70s and
  missing tool/text/camera replies to 30s. Touch can interrupt an active search.
- Use tested single-flight cancellation for both internet workers, with 24KiB TLS
  stacks. Grounding citation indices must reference an actual HTTPS source.
- `/api/status` reports custom-v8, reset reason, uptime, last Live error/tool and
  search enabled/busy/error/HTTP status/duration without queries or keys.
  `/search` shows the latest search failure instead of misleading older sources.
- Direct search isolation test (stop voice first): POST `/api/search/test` with
  `{query:"Senaste nyheterna om Svenska Röda Korset"}`, then GET the same endpoint
  until pending=false or an answer/error is returned. This bypasses Live tool
  selection but uses exactly the same Google-grounded worker and free-account key.
  Start a voice session only after this test completes. No API key is returned.
- Fix the observed `lookup_wikipedia` / `loopTask` stack-canary crash: Wikipedia,
  Commons search and JPEG download run on a dedicated 24KiB FreeRTOS worker,
  never inside the nested Live WebSocket callback. Touch and WebSocket remain serviced.
  Single-flight dispatch copies arguments, discards cancelled results and frees images.
  Only the main task renders downloaded images and sends Gemini tool responses.
  Completion logs include worker stack headroom, without queries or credentials.
- Optional `search_web` (v22+) calls the Tavily Search API over certificate-verified
  HTTPS (Amazon Root CA 1 / Starfield G2). Needs the owner's free Tavily key
  (1000 basic searches/month, hard stop, no card) saved via Command Hub or
  `POST /api/secrets {"tavily_api_key": "..."}` (applies without reboot; clear with
  `tavily_api_key_clear: true`). Each search = 1 credit (`search_depth=basic`, max 5
  results + short answer). Earlier DuckDuckGo scraping was dropped: CAPTCHA-blocked.
  Google Custom Search JSON API is closed to new customers.
  Test without voice: serial `search <query>` or `/api/search/test`.
- Search runs in a separate FreeRTOS task so Live and touch remain serviced; stale
  results are discarded. Bodies bounded to 48KiB; errors map to `tavily_invalid_key`,
  `tavily_monthly_quota_used_up`, `tavily_rate_limited_try_later`. `/search` shows the
  latest sources (RAM only). The key is never logged or returned by any API.
- SD when present, otherwise LittleFS on the original `spiffs` partition.
- Never autoformat nonblank storage after a mount failure.
- Gateway declarations are filtered when disabled, and calls are rejected too.
- Privacy/capability corrections override contradictory older prompts and memories.
- Touch during streamed speech stops audio and reconnects Gemini for a fresh utterance.
- POST `/api/voice/interrupt` requests the same action, with existing web authentication.
- `show_information` displays request-specific text, lists and percentage bars,
  or clears the screen. Swedish characters use the Unicode efont font.
  Oversized content returns an error so Gemini can shorten and retry, not claim success.
- Authenticated POST `/api/display` accepts `{type:"text",text:"..."}`,
  `{type:"list",title:"...",items:[{label:"..."}]}`,
  `{type:"bars",items:[{label:"...",value:50}]}`, `{image:"clear"}`,
  or `{jpeg_base64:"..."}`. JPEG is bounded to 64KiB and fitted to the LCD.
  JPEGs remain for 20 seconds; information for 60 seconds, then the face resumes.
- Local append-only memory files are bounded by retaining recent complete lines.
- `lookup_wikipedia` searches Swedish/English Wikipedia and returns excerpts with source links;
  Gemini summarizes them on the screen using `show_information`.
- `search_internet_images` searches Wikimedia Commons for JPEG photos/illustrations;
  `show_internet_image` displays a chosen result, not a bundled picture. Results include
  creator, license and source link. Relevance is selected by Gemini from descriptions,
  not guaranteed; ambiguous searches should be refined. PNG/SVG and generation are unsupported.
- Direct HTTPS uses ISRG Root X1 verification, NTP clock setup, an explicit Wikimedia host
  allowlist, no redirects, 64KiB body limits and bounded timeouts. No gateway/key needed.
  Search subjects and IP go to Wikimedia; results go to Google as conversation context.
  Listening pauses during fetching; background NTP/HTTPS does not block the Live loop.

## Tests
`g++ -std=c++17 tests/live_setup_policy.cpp -o /tmp/stackchan-setup-test && /tmp/stackchan-setup-test`
`g++ -std=c++17 tests/perf_policy.cpp -o /tmp/stackchan-perf-test && /tmp/stackchan-perf-test`
`g++ -std=c++17 tests/capability_policy.cpp -o /tmp/stackchan-policy-test && /tmp/stackchan-policy-test`
`g++ -std=c++17 tests/display_policy.cpp -o /tmp/stackchan-display-test && /tmp/stackchan-display-test`
`g++ -std=c++17 tests/internet_policy.cpp -o /tmp/stackchan-internet-test && /tmp/stackchan-internet-test`
`g++ -std=c++17 tests/async_tool_state.cpp -o /tmp/stackchan-async-test && /tmp/stackchan-async-test`
`g++ -std=c++17 -I <ArduinoJson/src> tests/web_research_policy.cpp -o /tmp/stackchan-web-test && /tmp/stackchan-web-test`
`g++ -std=c++17 -I <ArduinoJson/src> tests/live_session_policy.cpp -o /tmp/stackchan-live-test && /tmp/stackchan-live-test`
`g++ -std=c++17 tests/todo_policy.cpp -o /tmp/stackchan-todo-test && /tmp/stackchan-todo-test`
`g++ -std=c++17 tests/sensor_policy.cpp -o /tmp/stackchan-sensor-test && /tmp/stackchan-sensor-test`
`g++ -std=c++17 tests/talk_touch_policy.cpp -o /tmp/stackchan-talk-test && /tmp/stackchan-talk-test`
`g++ -std=c++17 tests/playback_motion_policy.cpp -o /tmp/stackchan-playback-test && /tmp/stackchan-playback-test`
`g++ -std=c++17 -I tests/stubs tests/servo_gesture_sequence.cpp src/ServoGestureController.cpp -o /tmp/stackchan-gesture-test && /tmp/stackchan-gesture-test`

## v36 performance validation
- Flash the app at 0x10000 without erase, reconnect USB, open USB-konsol → Prestanda.
- `[PERF]` schema-v1 reports once per ≥1000ms window: firmware/uptime, tick-sampled
  per-core CPU occupancy and sample counts (-1 means unavailable), elapsed stage maxima
  in microseconds, loop work and start-to-start gap, frame/loop counts, application FIFO
  milliseconds and speaker slots, per-turn underruns/drops/backpressure, internal free
  heap/largest block, PSRAM, stack high-water bytes, RSSI and BLE state.
- CPU is an estimate of non-idle task occupancy at FreeRTOS ticks, not exact runtime:
  tick aliasing and interrupt execution are not separately accounted. Stage measurements
  overlap: WebSocket includes its callbacks, audio pumping and LCD emotion changes.
  `loop_us` excludes the final 10ms sleep and PERF output; `gap_us` includes both.
- A 2048-byte TX buffer allows a full line to fit. If UART space is insufficient or
  the bounded line overflows, skip output instead of waiting; `skipped` is cumulative.
  No transcript, credentials or audio is included in telemetry. UI import/export stays
  local, strips unknown fields and retains at most 600 samples. Older firmware sends none.
- Speaking LCD cadence changes 40→90ms; initial prefill stays 800ms/19200 samples,
  starvation recovery uses 120ms/2880 samples (or immediately at turnComplete).
- Compare the SAME short and long prompts on the SAME Wi-Fi, first with BLE off, then
  on. Save separate JSON files and full console logs; record audible gaps and touch
  responsiveness. A zero FIFO sample alone is not proof of network failure or starvation.
  Do not run synthetic camera/TLS/servo benchmarks during Live voice playback.
- Host policy tests and browser checks cannot establish physical sound quality, tick
  sampling accuracy, radio coexistence or stability; these require the real CoreS3.

## v26 validation (historical)
- Enable the saved gesture toggle and start a new Live session; disabled stays disabled.
- Ask for a nod followed by looking up, then a little dance. Live queues at most eight
  calls, pauses capture, waits for servo completion plus 150 ms settling, and only then
  reports completed=true. A motion exceeding 15 s stops and disconnects to sleep.
- Ordinary responses no longer request automatic movements. Camera inspection is
  distinct from moving the head. These model instructions still need physical testing.
- PCM starts after up to 500 ms / 12000 queued samples, or immediately at turnComplete.
  Drain timeout measures five seconds without progress, not five seconds of speech.
  Compare playback underruns and peak_queue_ms for matched Swedish/English answers;
  wait_ms=0 alone does not establish glitch-free audio or a language-specific cause.
- Interrupted/disconnected sessions discard queued PCM and flush unfinished transcript
  separately; the uploaded v25 log mixed an unfinished Swedish transcript into the
  next English log entry. This does not establish that both were spoken together.
- Physical microphone/speaker/servo behavior cannot be validated in the build sandbox.

## Firmware-only update
Flash the built `firmware.bin` at **0x10000**, without Erase Flash/Erase All.
Do not flash this app-only image at 0x0. Partition bytes were compared with the
previous custom no-SD full image and were identical. Existing local settings are
intended to remain; this is not verified on physical hardware.

## Limits
- Local "Hi Stack Chan" wake word is implemented from v50 (v51 corrects a start crash),
  but detection accuracy and long-term stability remain unverified on hardware.
  It is not an arbitrary text setting: another phrase requires a matching model.
  Do not replace it with cloud always-on listening or a paid custom-model service.
  Reference: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/README.html
- No voice barge-in: the existing CoreS3 audio path is half-duplex. A screen tap
  interrupts; wait for the listening face before speaking. Reconnection discards
  the old Live session's unfinished turn, but local transcript context is reloaded.
- Image search is limited to Wikimedia Commons JPEGs; no arbitrary web browsing,
  image generation, custom freehand drawing, account access, or home-server requirement.
- API audio, camera analysis and recalled context are processed by Google, not
  exclusively on the robot. Do not dictate passwords, PINs or tokens.
- Firmware compilation and policy tests do not verify touch/audio/camera/LCD hardware.
- Live Google-grounded requests with the user's key are unverified: no Google key
  is available in the build environment. No provider request or payment activation
  occurs during the build. Verify on the robot with an
  actual current-information question and open `/search` to check real sources.
- To disable outbound gateway calls completely, leave Gateway enabled unchecked.
- Firmware contains no personal Wi-Fi name, password or API key.