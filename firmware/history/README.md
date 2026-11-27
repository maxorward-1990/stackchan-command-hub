> **Arkiv.** Overlay-bygget nedan användes för v66–v84. Sedan 2026-11-27 byggs firmware direkt från
> `firmware/` (se `firmware/README.md`). `prepare_apps.py` här kan bara köras från branchen `baseline-v84`,
> där app-filerna fortfarande ligger i `firmware/apps/`.

# App firmware experiments (v66–v71)

Built from the immutable v61 source (exported to `v61/firmware/`, commit 80a1c00; the project has no git history) with `prepare_apps.py`, which asserts voice, WakeNet, personality, dialogue storage and partitions are byte-identical to v61. v61 remains the stable recommendation and restore target.

Apps are bounded declarative configurations, not scripts. `/api/apps` uses the shared authenticated route table; rendering uses ScreenImage and the face canvas.

v67 adds:
- `/apps.json` on the robot's storage: each accepted start from Command Hub is saved (one small write). Boot reads it, never auto-starts. Corrupt/oversized files are ignored.
- Menu carousel: swipe up opens the menu; swipe left/right or tap `<` `>` in the title bar to switch between Inställningar and Appar. Appar starts the saved clock as fullscreen or widget using the robot clock (RTC/NTP). Without a valid clock it refuses.
- Weather is only shown as current for the remainder of its original 30-minute window.

Build: `python3 firmware/apps/prepare_apps.py /tmp/stackchan-v67`, then PlatformIO there. v66 is reproducible from its git commit. microSD app loading is a later, optional addition; LittleFS remains primary.

v68 adds the focus timer (pure tested `PomodoroPolicy.h`, `FocusApp`): `/api/apps/focus` start/pause/resume/stop, `/focus.json`, and a third menu page Fokus. Build: `prepare_apps.py /tmp/stackchan-v68`.

v69 adds `-`/`+` focus-minute steppers on the Fokus page (saved to `/focus.json`, defaults 25/5/4 without Hub) and the Gemini tool `control_timer` (start N minutes as a widget, stop/pause/resume/status; never persisted, no alarm sound). Build: `prepare_apps.py /tmp/stackchan-v69`.

v71: tap the bottom timer band (y ≥ 170, pure `PomodoroPolicy::widgetTap`) to stop a visible timer instead of starting voice; timers from 10 s (`control_timer` takes minutes and/or seconds, Fokus stepper has 15/30/45 s, `/focus.json` adds `focus_sec`); swipe down closes the menu from any page and the X target is wider. Build: `prepare_apps.py /tmp/stackchan-v71`.
