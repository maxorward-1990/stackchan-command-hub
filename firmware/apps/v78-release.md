# v78 — camera without a 30 KiB internal block; speaker start diagnostics

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`; v77 (diagnostic mode) and everything before it retained.

## Why

The first standard diagnosis (2026-11-25, v77) logged `cam_hal: DMA buffer 30720 Byte malloc failed, the current largest free block:18420 Byte`. The camera driver needs one contiguous 30 KiB internal DMA block at each init; that only exists right after boot (31.7 KiB), so capture failed after normal use on USB and Wi-Fi alike. The same run played Gemini audio that the owner did not hear, although playback reported success and no chunk was rejected.

## Scope

- `CameraCapture.cpp`: `esp_camera_set_psram_mode(true)` before `esp_camera_init` (public esp32-camera API, same driver build as the framework): frames are DMA'd into the existing PSRAM frame buffer, so only small descriptors use internal RAM. A `[CAMERA] init psram_dma=… internal_largest=… dma_largest=…` line is logged at each init.
- `GeminiLiveProbe.cpp`: `[AUDIO] speaker begin=… running=… enabled=… volume=… internal_free=… internal_largest=… dma_largest=…` when reply audio starts. No behaviour change.

No change to voice, wake word, memory layout, partitions or network paths. Local PlatformIO build: RAM 42.6 %, flash 46.4 %.

## Physical verification still required

Flash v78, open Kamera over USB after some minutes of use, and run the standard diagnosis; the package must show a camera frame, `[CAMERA] init psram_dma=1`, and `[AUDIO]` lines for every reply. v76 stays recommended until then; v61 remains the stable restore.
