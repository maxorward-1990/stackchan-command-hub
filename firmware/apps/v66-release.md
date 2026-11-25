# v66: first local clock app (experimental)

Source baseline: `80a1c00c0540429091e4686188ee27ace5591dd4` (v61).
Generated through `prepare_v66.py`; voice, WakeNet, personality, memory and partitions verified byte-identical to that source.

Application image only: `public/firmware/v66-app.bin` at `0x10000`.
Size: **3,087,648 bytes**.
MD5: `45499caee65c1ea44f07900a87c0f9b1`.
SHA-256: `c5d5e7696ab6b4d18d5feaa5cac4d28c4a0519cac8b3f5b98ad2512694168107`.
Unchanged wake model/table accompanies the normal shared flasher plan. No erase, filesystem image or factory image is offered.
v61 MD5 remains `04eba1aed7207425c1a40bb0d22311fb`; it remains the first offered app, stable recommendation and restore target.

Build: pioarduino 55.03.313, Arduino 3.3.13, qio_qspi, M5Unified 0.2.20, M5GFX 0.2.36, ArduinoJson 7.4.3, NimBLE 1.4.3. Link-time static RAM 138,144/327,680 bytes; linked flash 3,017,559/6,553,600 bytes. These are build allocation totals, not free runtime memory or measured performance.

Verified on host: 29 baseline C++ policy/sequence tests, new app policy and actual app-handler tests, four baseline lifecycle/memory/wiring tests. Browser: real weather request, fullscreen/widget start, reload/readback, stop, old-firmware rejection and 390px phone layout, using simulated robot responses. No physical robot was available.

## Owner test before promotion
1. Install v66 explicitly, unplug/replug USB, and read the running version. A write history entry does not prove it booted.
2. In Appar fetch weather and start the widget. Unplug the computer; check the clock advances and ordinary voice/wake still works.
3. Start fullscreen while idle. Try touch and wake separately; confirm the assistant returns and can answer a real question. Repeat start/stop through the Hub.
4. Check camera/menu/microphone tests terminate fullscreen without trapping controls. Widget should yield and return afterward.
5. Check weather expires rather than appearing current, and that reboot clears app state while retaining settings.
6. If voice or wake regresses, restore stable v61; capture the test log before proposing further changes.

Not yet implemented: on-robot automatic weather fetching, auto-idle startup, saved boot app, dynamic voice-tool registration, arbitrary script execution or apps from microSD.