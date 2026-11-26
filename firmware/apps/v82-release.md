# v82 — answers after a web search follow the language of the question

Built from immutable v61 through `prepare_apps.py`; v81 and everything before it retained.

## Why

With `auto` working (v81), an English "How many people live in the US?" still got a Swedish answer after `search_web`. The answer turn is sent on a new Live socket (the old one is closed to free memory for TLS); it only contained the model's own English search query, the search data and Swedish dialogue memory, so "answer in the user's language" had nothing to go on.

## Scope

- `GeminiLiveProbe.cpp`: remembers the latest input transcription (bounded to 300 characters, reset after 4 s between fragments) and sends it as `search_request: user's own words: "…"; web search query: …`; falls back to the query alone if too long.
- `SearchHandoffMemory.h`: the answer instruction names the language of the user's own words, not of the query, results or memory.

## Physical verification still required

Ask an English question that needs a search, then a Swedish one: each answer should come in the question's language.
