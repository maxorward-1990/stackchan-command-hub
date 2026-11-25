/** Validation and safe summaries for robot configuration; never persist credentials. */
export function wifiError(ssid: string, password: string): string | null {
  const bytes = new TextEncoder().encode(ssid);
  if (!ssid.trim() || bytes.length > 32 || /[\u0000-\u001f\u007f]/.test(ssid) || ssid === "set" || ssid === "missing") return "Ange ett nätverksnamn på 1–32 byte (inte set eller missing).";
  if (!/^[\x20-\x7e]{8,63}$/.test(password) && !/^[a-fA-F0-9]{64}$/.test(password)) return "Ange ett WPA/WPA2-lösenord på 8–63 tecken, eller 64 hextecken.";
  return null;
}

export function requestSummary(path: string, body: unknown): string {
  if (path === "/api/secrets") return "[hemligheter dolda]";
  return JSON.stringify(body, (key, value: unknown) => /password|secret|token|api_key|wifi_ssid/i.test(key) ? "[dolt]" : value)?.slice(0, 60) ?? "";
}

export interface StereoDiagnostic {
  ok: boolean; reason?: string; left_rms?: number; right_rms?: number;
  left_peak?: number; right_peak?: number; balance_r_minus_l?: number;
  tdoa_us?: number; corr?: number; direction_hint?: string;
  capture_timed_out?: boolean; duration_ms?: number;
  same_sample_ratio?: number; left_zero_ratio?: number; right_zero_ratio?: number;
}

export type MicStep = "quiet" | "left" | "right";
export interface MicFinding { level: "ok" | "warn" | "fail"; text: string }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rmsOf = (list: StereoDiagnostic[], ch: "left" | "right") => avg(list.filter((a) => a.ok).map((a) => a[`${ch}_rms`] ?? 0));

/** Single-capture channel health: dead (all-zero) inputs and duplicated mono. */
export function channelFindings(a: StereoDiagnostic): MicFinding[] {
  if (!a.ok) return [];
  const out: MicFinding[] = [];
  if ((a.left_zero_ratio ?? 0) > 0.95) out.push({ level: "fail", text: "Vänster kanal ger bara nollor – mikrofonen svarar inte." });
  if ((a.right_zero_ratio ?? 0) > 0.95) out.push({ level: "fail", text: "Höger kanal ger bara nollor – mikrofonen svarar inte." });
  if ((a.same_sample_ratio ?? 0) > 0.98) out.push({ level: "warn", text: "Vänster och höger är identiska – troligen samma mikrofon kopierad till båda kanalerna." });
  return out;
}

/** Guided test verdict: knock near each side must raise that channel above silence and above the other side. */
export function micVerdict(steps: Partial<Record<MicStep, StereoDiagnostic[]>>): MicFinding[] {
  const q = steps.quiet ?? [], l = steps.left ?? [], r = steps.right ?? [];
  if (!q.some((a) => a.ok) || !l.some((a) => a.ok) || !r.some((a) => a.ok)) return [{ level: "warn", text: "Kör alla tre stegen (tyst, vänster, höger) för en slutsats." }];
  const out: MicFinding[] = [];
  const all = [...q, ...l, ...r];
  const seen = new Set<string>();
  for (const a of all) for (const f of channelFindings(a)) if (!seen.has(f.text)) { seen.add(f.text); out.push(f); }
  const base = { left: Math.max(rmsOf(q, "left"), 5), right: Math.max(rmsOf(q, "right"), 5) };
  for (const [ch, name, list] of [["left", "Vänster", l], ["right", "Höger", r]] as const) {
    const level = rmsOf(list, ch);
    out.push(level >= base[ch] * 2 ? { level: "ok", text: `${name} mikrofon reagerar (${Math.round(level)} mot tyst ${Math.round(base[ch])}).` } : { level: "fail", text: `${name} mikrofon reagerade knappt på ljud (${Math.round(level)} mot tyst ${Math.round(base[ch])}).` });
  }
  const leftSide = rmsOf(l, "left") > rmsOf(l, "right"), rightSide = rmsOf(r, "right") > rmsOf(r, "left");
  out.push(leftSide && rightSide ? { level: "ok", text: "Kanalerna skiljer sidorna åt – båda mikrofonerna fungerar oberoende." } : { level: "warn", text: "Kanalerna skiljer inte sidorna åt. Mikrofonerna kan sitta nära varandra, eller L/R vara omkastade/kopierade." });
  return out;
}

export function stereoLevel(rms: number | undefined): number {
  if (rms === undefined || !Number.isFinite(rms) || rms <= 0) return 0;
  return Math.min(100, Math.max(0, 100 + 20 * Math.log10(rms / 32768)));
}

export function stereoLabel(a: StereoDiagnostic): string {
  if (!a.ok) return a.reason === "speaker_playing" || a.reason === "gemini_or_mic_busy" ? "Avsluta samtalet och vänta tills roboten är tyst." : "Mätningen misslyckades. Försök igen när roboten vilar.";
  const labels: Record<string, string> = { quiet: "För tyst", left_louder: "Vänster kanal starkare", right_louder: "Höger kanal starkare", center_or_uncertain: "Jämnt / osäker riktning", right_delayed_or_left_first: "Vänster kanal först (osäkert)", left_delayed_or_right_first: "Höger kanal först (osäkert)" };
  return labels[a.direction_hint ?? ""] ?? "Osäker riktning";
}
/** Same rules as firmware SmartHomePolicy: Access ID 10–64, Secret 16–64, letters/digits only. */
export function tuyaKeyError(clientId: string, clientSecret: string): string | null {
  const id = clientId.trim(), secret = clientSecret.trim();
  if (!/^[A-Za-z0-9]{10,64}$/.test(id)) return "Access ID ska vara 10–64 bokstäver/siffror (kopiera från Tuya-projektets Overview).";
  if (!/^[A-Za-z0-9]{16,64}$/.test(secret)) return "Access Secret ska vara 16–64 bokstäver/siffror (tryck på ögat i Tuya och kopiera).";
  return null;
}
