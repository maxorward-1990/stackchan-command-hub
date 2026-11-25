import { describe, expect, it } from "vitest";
import { channelFindings, micVerdict, requestSummary, stereoLabel, stereoLevel, wifiError, type StereoDiagnostic } from "./robot-network";

describe("Wi-Fi validation and privacy", () => {
  it("accepts home and hotspot credentials without trimming passwords", () => { expect(wifiError("Home", "12345678")).toBeNull(); expect(wifiError("Hotspot", " password ")).toBeNull(); });
  it("bounds SSID by UTF-8 bytes", () => { expect(wifiError("å".repeat(16), "12345678")).toBeNull(); expect(wifiError("å".repeat(17), "12345678")).not.toBeNull(); });
  it("rejects missing/unsupported credentials", () => { expect(wifiError("", "12345678")).not.toBeNull(); expect(wifiError("Home", "1234567")).not.toBeNull(); expect(wifiError("set", "12345678")).not.toBeNull(); });
  it("hides all secrets and network names from command summaries", () => { expect(requestSummary("/api/secrets", { wifi_password: "sensitive", tavily_api_key: "private" })).not.toContain("sensitive"); expect(requestSummary("/api/runtime", { wifi_ssid: "private-home" })).not.toContain("private-home"); });
});
describe("stereo diagnostics", () => {
  it("bounds PCM levels and rejects invalid numbers", () => { expect(stereoLevel(0)).toBe(0); expect(stereoLevel(NaN)).toBe(0); expect(stereoLevel(32768)).toBe(100); expect(stereoLevel(65536)).toBe(100); });
  it("does not report a busy capture as a successful direction", () => { expect(stereoLabel({ ok: false, reason: "gemini_or_mic_busy", direction_hint: "left_louder" })).toContain("Avsluta samtalet"); });
});
const cap = (l: number, r: number, extra: Partial<StereoDiagnostic> = {}): StereoDiagnostic => ({ ok: true, left_rms: l, right_rms: r, ...extra });
describe("two-microphone health", () => {
  it("flags an all-zero channel as dead", () => { expect(channelFindings(cap(0, 50, { left_zero_ratio: 1 }))[0]?.level).toBe("fail"); });
  it("flags identical channels as duplicated mono", () => { expect(channelFindings(cap(50, 50, { same_sample_ratio: 1 }))[0]?.level).toBe("warn"); });
  it("passes when each side's knock raises that channel most", () => {
    const v = micVerdict({ quiet: [cap(10, 10)], left: [cap(200, 80)], right: [cap(70, 220)] });
    expect(v.every((f) => f.level === "ok")).toBe(true);
  });
  it("fails a channel that does not react to sound", () => {
    const v = micVerdict({ quiet: [cap(10, 10)], left: [cap(12, 90)], right: [cap(11, 200)] });
    expect(v.some((f) => f.level === "fail" && f.text.startsWith("Vänster"))).toBe(true);
  });
  it("requires all three steps before a verdict", () => { expect(micVerdict({ quiet: [cap(10, 10)] })[0]?.level).toBe("warn"); });
});
