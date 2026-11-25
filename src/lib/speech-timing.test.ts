import { describe, expect, it } from "vitest";
import { applyLine, newRun } from "./speech-timing";

describe("speech test log parser", () => {
  it("reads robot timings and finishes when playback is done", () => {
    let r = newRun("hej");
    r = applyLine(r, "[TID] start text", 10);
    r = applyLine(r, "[ROBOT] Hej!", 900);
    r = applyLine(r, "[TID] forsta_ljud_ms=812", 950);
    r = applyLine(r, "[TUR] klar", 1500);
    r = applyLine(r, "[TID] tur_klar_ms=1490", 1500);
    expect(r.done).toBe(false);
    r = applyLine(r, "[TID] uppspelning_klar_ms=2300", 2400);
    expect(r).toMatchObject({ firstTextMs: 900, firstAudioMs: 812, turnDoneMs: 1490, playbackDoneMs: 2300, reply: "Hej!", done: true });
  });
  it("records tools", () => {
    const r = applyLine(newRun("x"), "[VERKTYG] search_web {\"q\":\"v\"}", 100);
    expect(r.tools).toEqual(["search_web"]);
  });
  it("marks a 30 s reply timeout as an error", () => {
    const r = applyLine(newRun("x"), "[TID] timeout_ms=30000", 30000);
    expect(r.done).toBe(true);
    expect(r.error).toBe("Inget svar inom 30 s");
  });
  it("gives up after 45 s", () => {
    const r = applyLine(newRun("x"), "GeminiLive: mic level peak=1 rms=1 chunks=2", 45000);
    expect(r.done).toBe(true);
  });
});

describe("successful tool lines", () => {
  it("does not stop the test on ok=true with an empty error field", () => {
    const r = applyLine(newRun("q"), "GeminiLive: tool result name=search_web ok=true error=", 100);
    expect(r.done).toBe(false);
    expect(r.error).toBeUndefined();
  });
  it("still stops on a real error", () => {
    const r = applyLine(newRun("q"), "GeminiLive: tool result name=search_web ok=false error=tls_alloc", 100);
    expect(r.done).toBe(true);
  });
  it("stops at once when a screen tap hijacks the test turn", () => {
    const r = applyLine(newRun("hej"), "GeminiLive: touch interrupted; reconnecting for speech", 500);
    expect(r.done).toBe(true);
    expect(r.error).toContain("tryckte");
  });
});
