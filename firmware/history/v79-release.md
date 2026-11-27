# v79 — camera clock while the microphone is off; no physical light actions in diagnostic mode

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`; v78 (PSRAM camera DMA, `[CAMERA]`/`[AUDIO]` logs) and everything before it retained.

## Why

The standard diagnosis of 2026-11-25 19:44 (v78) and its USB log showed:

- Camera frames succeeded while `[WAKE] listening` (microphone running) and failed with `camera_capture_or_jpeg_failed` right after `[WAKE] paused; model released`, i.e. whenever motion or other work stopped the microphone. Hypothesis (strong correlation, not yet proven): the camera's XCLK on this StackChan comes from the audio codec's MCLK on GPIO0, which only runs while `M5.Mic` is active.
- The simulated Swedish question was read by an English computer voice, transcribed as `B A D A R track plus ray`, and Gemini ran a real `control_lights` scene ("Hallamporna på") during the diagnosis.

## Scope

- `CameraCapture.cpp`: when neither microphone, speaker nor AudioDiagnostics is active, the camera starts `M5.Mic` only to provide the clock (`s_micClockBorrowed`) and ends it on deinit or init failure. Logs `[CAMERA] clock mic_running=… borrowed=…`, `[CAMERA] mic clock returned`, and `[CAMERA] no frame mic_running=… borrowed=…` when `esp_camera_fb_get` fails. No audio is read from the borrowed microphone.
- `GeminiLiveProbe.cpp`: `control_lights` returns `diagnostic_mode_no_physical_actions` while `DiagnosticMode::active()` and logs `[DIAG] control_lights blocked (diagnostic mode)`.

No change to wake word, memory layout, partitions or network paths. Local PlatformIO build: RAM 42.6 %, flash 46.4 % (3041979 bytes).

## Physical verification still required

Flash v79, move the head (or run the standard diagnosis, which now takes a camera frame right after motion) and open Kamera over USB; the log must show `[CAMERA] clock … borrowed=1` and a frame. v76 stays recommended until then; v61 remains the stable restore.
