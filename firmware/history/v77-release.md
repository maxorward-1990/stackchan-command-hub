# v77 — diagnostic mode for Command Hub's standard diagnosis

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`; everything in v76 is retained.

## Scope

- `/api/diagnostic` (HTTP and USB/BLE through the shared route table): `{"active": true, "seconds": 600}` turns on a bounded diagnostic mode (1–900 s, pure tested `DiagnosticModePolicy.h`); `{"active": false}` ends it. It also expires by itself, so a closed browser cannot leave it on.
- While active, input and output transcripts are not appended to dialogue memory (both `appendDialogue` call sites in `GeminiLiveProbe.cpp`). Nothing else changes: conversations, tools, audio, wake word and settings behave exactly as normal. `[DIAG]` lines mark on/off in the USB log.
- `/api/status` now reports the real `wake_word_available`/`wake_word_listening` and `diagnostic_mode_ms` instead of the stale hardcoded `wake_word_available: false`.

No change to audio, wake-word thresholds, memory layout, partitions or network paths.

## Tests

`diagnostic_mode_policy.cpp` covers bounds (1–900 s), explicit stop and millis() rollover; `prepare_apps.py` asserts both memory writes are guarded. Full suite: `bash firmware/run_tests.sh` (81 tests). Local PlatformIO build: RAM 42.5 %, flash 46.4 % (+1.7 kB vs v76).

## Physical verification still required

Flash v77, run Command Hub's standard diagnosis, then confirm in Samtalslogg that no diagnosis turns were stored and that a normal conversation afterwards is stored again. v76 stays installable; v61 remains the stable restore.
