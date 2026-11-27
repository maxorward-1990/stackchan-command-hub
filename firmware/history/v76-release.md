# v76 — start-only wake DMA guard

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`, retaining v71 apps, v73 threshold quantization, v74 VAD setting and v75 worker ownership/cancellation.

## Scope

The main-loop 8192-byte DMA check now applies only when `WakeWord::listening()` is false. An active listener is no longer stopped because its own allocations or a settings request reduce free DMA headroom. Network-worker busy checks remain unconditional. This retains cold-start protection rather than deleting it entirely.

Saving an accepted threshold still drains the mic, destroys the model once and recreates it with the new threshold. No model reset, peak gate, microphone gain/filter change, new network path or flash-layout change.

## Reproduction and tests

`wake_dma_v76.py` compiles the actual staged main-loop gate with real staged `WakeWord.cpp`: 8191 bytes blocks a cold start; 8192 allows it; 2036 bytes during listening does not cause model churn over 1000 iterations. Changing the accepted threshold to 450 recreates the model exactly once and stays listening for another 1000 iterations. Tuya/Tavily/Commons busy flags still pause listening and insufficient headroom prevents restart. The same test fails against v75.

Threshold quantization, Personality persistence/rollback and both app runtime tests also pass. These host fakes verify control flow, not real I2S allocation, acoustic recognition or physical stability.

## Artifact and restore

- App: 3,110,592 bytes; MD5 `ea9d15aad7621697a2c53e1aec2d971e`; address `0x10000`.
- Existing partition table/model unchanged, LittleFS retained, no erase.
- v75 withdrawn from installation options after the reported lockup.
- v61 stays the stable restore; v71 binary is unchanged.

## Physical verification still required

Flash v76, save 0.450 while wake listening is active, confirm readback and persistence after reboot, test repeated wake/conversation/lamp-cancel cycles and inspect a fresh USB log. No physical robot is accessible from this build environment.