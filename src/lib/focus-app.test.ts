import { describe, expect, it } from "vitest";
import { DEFAULT_FOCUS, focusStartRequest, focusStatusSchema, focusTotalMinutes, mmss, readFocus } from "./focus-app";

describe("focus timer app", () => {
  it("defaults to 25 min focus, 5 min break, 4 rounds", () => {
    expect(DEFAULT_FOCUS).toMatchObject({ focus_min: 25, break_min: 5, rounds: 4 });
  });
  it("accepts limits 1-90 focus, 1-30 break, 1-8 rounds and rejects outside", () => {
    expect(focusStartRequest({ focus_min: 90, break_min: 30, rounds: 8, mode: "widget" })).toEqual({ action: "start", version: 1, focus_min: 90, break_min: 30, rounds: 8, mode: "widget" });
    expect(() => focusStartRequest({ focus_min: 91, break_min: 5, rounds: 4, mode: "widget" })).toThrow();
    expect(() => focusStartRequest({ focus_min: 25, break_min: 31, rounds: 4, mode: "widget" })).toThrow();
    expect(() => focusStartRequest({ focus_min: 25, break_min: 5, rounds: 9, mode: "widget" })).toThrow();
    expect(() => focusStartRequest({ focus_min: 0, break_min: 5, rounds: 4, mode: "widget" })).toThrow();
  });
  it("no break after the last round", () => {
    expect(focusTotalMinutes({ focus_min: 25, break_min: 5, rounds: 4, mode: "widget" })).toBe(115);
  });
  it("formats remaining time rounding up seconds", () => {
    expect(mmss(1_499_001)).toBe("25:00"); expect(mmss(0)).toBe("00:00");
  });
  it("falls back to defaults for corrupt saved settings and rejects clock-app status", () => {
    expect(readFocus({ focus_min: "x" })).toEqual(DEFAULT_FOCUS);
    expect(focusStatusSchema.safeParse({ ok: true, supported: true, version: 1, active: false, mode: "off" }).success).toBe(false);
  });
});
