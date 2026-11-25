import { describe, expect, it } from "vitest";
import { AUDIO_PCM_BYTES, isSpeechLanguages, makeWav } from "./audio-diagnostics";
describe("robot audio diagnostics", () => {
  it("exports exactly three seconds of 16 kHz mono 16-bit PCM", () => {
    const pcm = new Uint8Array(96000); pcm[0] = 12; pcm[95999] = 34;
    expect(AUDIO_PCM_BYTES).toBe(96000);
    const wav = makeWav(pcm); const header = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(16000);
    expect(header.getUint16(34, true)).toBe(16);
    expect(header.getUint32(40, true)).toBe(96000);
    expect(wav.length).toBe(96044);
    expect(wav[44]).toBe(12); expect(wav[96043]).toBe(34);
  });
  it("rejects incomplete captures instead of exporting partial audio", () => {
    expect(() => makeWav(new Uint8Array(4000))).toThrow();
  });
  it("permits Swedish-only, English-only and matching bilingual responses as runtime choices", () => {
    expect(isSpeechLanguages("sv")).toBe(true);
    expect(isSpeechLanguages("en")).toBe(true);
    expect(isSpeechLanguages("sv-en")).toBe(true);
    expect(isSpeechLanguages("auto")).toBe(true);
    expect(isSpeechLanguages("garbage")).toBe(false);
  });
});