# v73: bounded WakeNet threshold readback

## Rule and scope audit
The listener must remain active when WakeNet accepts and rounds a chosen threshold. Microphone ownership must still yield to voice, menu, camera and diagnostics. Saved settings and past flash records must not be rewritten.

Code read and checked:
- Model creation in staged `WakeWord.cpp`: v72 violated the rule by rejecting 0.490 → 0.486. v73 accepts finite, successful readback within 0.020 (plus float-comparison epsilon), rejects invalid values, and logs requested/actual values.
- Runtime threshold change: compares the saved requested integer, not quantized readback; safely stops capture before destroying and recreating the model. Uses the same corrected creation path.
- Boot/reboot: staged `Personality.cpp` preserves saved threshold, validates it, and keeps 490 as the missing-field default. Host test exercises persistence and failed-save rollback.
- Wake after voice/menu/camera/diagnostics: main-loop `WakeWordPolicy` gates remain unchanged. All resumes enter the same corrected `WakeWord::loop`/`load` path; no second WakeNet worker exists.
- Personlighet load/save/selector: sends and reads integer `wake_threshold_milli`, only when supported. No float-readback equality assumption. Existing settings are not automatically changed.
- Shared Hub client and authenticated GET/POST `/api/personality`: USB/Bluetooth/HTTP use the same route and Personality validation. No separate threshold setter.
- Withdrawn checkout `firmware/src/WakeWord.cpp`: no strict readback-equality check; intentionally not used for this build and unchanged.
- Firmware screen: shared release list governs install and restore. v72 is withdrawn from new installs; its image and completed flash history remain intact. v73 is experimental; v61 restore and v71 reference binaries are unchanged.
- No database, scheduled task, translation layer or cloud wake processing is involved.

## Reproduction and validation
- Real failure input: requested 0.490, readback 0.486 with successful SDK setter.
- Extended `wake_threshold_v72.py` exercises the real staged module: rounded readback, 50 listening loops without recreate, ±0.020 accepted, ±0.021 rejected, invalid/ignored/failed setter, threshold change and repeated detect/release cycles.
- Personality persistence test verifies legacy load, saved threshold reload, invalid inputs and failed-save rollback.
- Build produced app image 3,110,320 bytes; MD5 `24e3148e1d52e106727f724b1ff2abb1`.
- Flash app at 0x10000; unchanged v50 table/model; no erase, LittleFS remains at 0xC90000.

## Physical verification outstanding
After flashing, power-cycle and confirm `custom-v73`. At chosen 0.490, look for `threshold applied requested=0.490 actual=0.486`, `ready`, then `listening`. Test Hi first, then Hey/Hej, and a quiet period for false wakes. Host simulation cannot prove phrase recognition or real microphone stability.