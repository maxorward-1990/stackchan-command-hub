export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_SECONDS = 3;
export const AUDIO_PCM_BYTES = AUDIO_SAMPLE_RATE * AUDIO_SECONDS * 2;
export const AUDIO_CHUNK_BYTES = 768;
export type SpeechLanguages = "sv-en" | "sv" | "en" | "auto";
export const SPEECH_LANGUAGES: readonly [SpeechLanguages, string][] = [
  ["sv-en", "Svenska och engelska"], ["sv", "Endast svenska"],
  ["en", "Endast engelska"], ["auto", "Automatiskt – alla språk"],
];
export function isSpeechLanguages(value: string): value is SpeechLanguages {
  return SPEECH_LANGUAGES.some(([key]) => key === value);
}
export function makeWav(pcm: Uint8Array): Uint8Array {
  if (pcm.byteLength !== AUDIO_PCM_BYTES) throw new Error("Ljudtestet är ofullständigt. Spela in igen.");
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, AUDIO_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44); return wav;
}