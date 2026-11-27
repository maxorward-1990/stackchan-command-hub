# v80 — reply language follows the latest utterance; deferred listen is not a failure

Built from immutable v61 (`80a1c00c0540429091e4686188ee27ace5591dd4`) through `prepare_apps.py`; v79 and everything before it retained.

## Why

The standard diagnosis of 2026-11-26 17:58 (v79, all steps OK) and its USB log showed:

- The spoken English question "What is 3 + 3?" was transcribed correctly three times, but two replies were "Det blir 6." The `sv-en` instruction ended with "Default to Swedish when uncertain" while profile, memory and the preceding turns were Swedish.
- Four `CMD listen: failed` lines during the stress step, although recording started right after `setupComplete`: the cold start deferred the microphone while the head re-centred (`record ignored; speaking`), and `requestConversationStart()` returned `realtime_recording_` (false).
- The interrupt-test reply began "instruktionerna säger att jag ska svara kort".

## Scope

- `SpeechPolicy.h` (`sv-en`): the reply language comes from the latest utterance alone, even with Swedish profile/memory/turns; Swedish only when the utterance language is genuinely unclear.
- `GeminiLiveProbe.cpp`: `requestConversationStart()` returns true for a cold start whose microphone is pending (also fixes the error face on a touch start during motion); the capability correction forbids quoting or mentioning instructions.
- Command Hub standard diagnosis: the voice step reads `[ROBOT]` and reports `svar_rätt_språk`, warning on a wrong-language reply.

No change to wake word, memory layout, partitions, camera or network paths.

## Physical verification still required

Flash v80 and run the standard diagnosis: `svar_rätt_språk` should be 3/3 and no `CMD listen: failed`. A Swedish question should still get a Swedish answer.
