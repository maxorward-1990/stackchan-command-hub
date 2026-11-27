# v83 — diagnosis conversations start without dialogue memory

Built from immutable v61 through `prepare_apps.py`; v82 and everything before it retained.

## Why

On v82 a real conversation switched language correctly (English Minnesota question in English, Swedish Västergötland question in Swedish, both after web search). The voice-only diagnosis right after it asked "What is 3 + 3?" in English three times and got Swedish every time: the injected active dialogue memory (951 chars) ended with a Swedish exchange, which outweighed a short synthetic English question. The v81 diagnosis, whose memory ended in English, answered in English.

## Scope

- `GeminiLiveProbe.cpp`: while `DiagnosticMode::active()`, Live setup injects no active dialogue memory. Diagnosis turns were already not stored (v77); now they are also independent of earlier real conversations, so results are reproducible.

## Physical verification still required

Have a Swedish conversation, then run "Bara röstsimulering": `svar_rätt_språk` should be 3/3 and the USB log should show no `injected active dialogue context` line during the test.
