# v81 — the saved speech language survives a reboot

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`; v80 and everything before it retained.

## Why

With `speech_languages: "auto"` saved in runtime.json, every Live setup on v80 still logged `speech_languages=sv-en`. `ConfigManager::load()` reads runtime.json and then gateway.json with the same `loadJsonConfig`, whose language default was the literal `"sv-en"`; gateway.json has no language key, so it reset the saved value at every boot (flashing v80 rebooted). A save from Command Hub applied the value only until the next reboot. This bug exists in v61 and every later build.

## Scope

- `ConfigManager.cpp`: a JSON file without `speech_languages` keeps the current value instead of resetting it to `sv-en`.

## Physical verification still required

Flash v81 with "auto" saved: the USB log must show `speech_languages=auto` at every `GeminiLive: setup`, also after a reboot.
