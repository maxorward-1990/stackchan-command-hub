// Compact, deterministic overview placed first in a saved test package, so the
// package can be judged from a few hundred lines instead of every log line.
// Pure: derived only from the already-redacted events and validated [PERF] samples.
import type { PerfSample } from "./performance";

export interface SummaryEvent { elapsedMs: number; kind: "serial" | "command" | "marker"; text: string }
export interface TestSummary {
  durationMin: number;
  firmware: string[];
  counts: { events: number; serial: number; commands: number; markers: number; dropped: number };
  wake: { ready: number; detected: number; rejectedLowSignal: number; paused: number; problems: number };
  conversation: { sessions: number; turnsDone: number; interrupted: number; disconnects: Record<string, number> };
  problems: { reboots: number; crashes: number; errorLines: number };
  memory: { minHeap: number | null; minLargest: number | null; minPsram: number | null; maxWaitMs: number | null; underruns: number; perfSamples: number };
  markers: string[];
  timeline: string[];
}

export const SUMMARY_TIMELINE_MAX = 60;
const CRASH = /Guru Meditation|abort\(\) was called|Backtrace:|Task watchdog|panic'ed|Stack canary|Brownout/i;
const BOOT = /^(?:ESP-ROM:|rst:0x)/;
const WAKE_PROBLEM = /^\[WAKE\] (?:mic start failed|model\/buffer allocation failed|start blocked|threshold configuration failed|model unavailable|disabled for this boot)/;
const ERROR = /^E \(\d+\)|\b(?:error|failed|failure)\b/i;

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function minOf(samples: PerfSample[], key: "heap" | "largest" | "psram" | "wait_ms", max = false): number | null {
  if (!samples.length) return null;
  return samples.reduce((m, s) => (max ? Math.max(m, s[key]) : Math.min(m, s[key])), samples[0]![key]);
}

export function summarizeTest(events: SummaryEvent[], perf: PerfSample[], durationMs: number, dropped: number, snapshotFirmware: string[] = []): TestSummary {
  const s: TestSummary = {
    durationMin: Math.round(durationMs / 600) / 100,
    firmware: [],
    counts: { events: events.length, serial: 0, commands: 0, markers: 0, dropped },
    wake: { ready: 0, detected: 0, rejectedLowSignal: 0, paused: 0, problems: 0 },
    conversation: { sessions: 0, turnsDone: 0, interrupted: 0, disconnects: {} },
    problems: { reboots: 0, crashes: 0, errorLines: 0 },
    memory: { minHeap: minOf(perf, "heap"), minLargest: minOf(perf, "largest"), minPsram: minOf(perf, "psram"), maxWaitMs: minOf(perf, "wait_ms", true), underruns: perf.reduce((n, p) => n + p.underruns, 0), perfSamples: perf.length },
    markers: [], timeline: [],
  };
  const fw = new Set(snapshotFirmware.filter(Boolean));
  for (const p of perf) fw.add(p.fw);
  // A falling uptime between perf samples means the robot restarted during the test.
  for (let i = 1; i < perf.length; i++) if (perf[i]!.ms < perf[i - 1]!.ms) s.problems.reboots++;
  let bootLines = 0;
  let omitted = 0;
  const note = (e: SummaryEvent, label: string) => {
    if (s.timeline.length < SUMMARY_TIMELINE_MAX) s.timeline.push(`${clock(e.elapsedMs)} ${label}`);
    else omitted++;
  };
  for (const e of events) {
    const t = e.text;
    if (e.kind === "marker") { s.counts.markers++; s.markers.push(`${clock(e.elapsedMs)} ${t}`); note(e, `MARKERING: ${t}`); continue; }
    if (e.kind === "command") { s.counts.commands++; continue; }
    s.counts.serial++;
    if (t.startsWith("[PERF] ")) continue;
    if (BOOT.test(t)) { bootLines++; note(e, `OMSTART: ${t.slice(0, 80)}`); continue; }
    if (CRASH.test(t)) { s.problems.crashes++; note(e, `KRASCH: ${t.slice(0, 160)}`); continue; }
    if (t.startsWith("[WAKE] ready")) s.wake.ready++;
    else if (t.startsWith("[WAKE] detected")) { s.wake.detected++; note(e, t.slice(0, 120)); }
    else if (t.startsWith("[WAKE] rejected reason=low_signal")) s.wake.rejectedLowSignal++;
    else if (t.startsWith("[WAKE] paused")) s.wake.paused++;
    else if (WAKE_PROBLEM.test(t)) { s.wake.problems++; note(e, `VÄCKORD-PROBLEM: ${t.slice(0, 140)}`); }
    else if (t.startsWith("GeminiLive: setupComplete")) { s.conversation.sessions++; note(e, "samtal startat"); }
    else if (t.startsWith("[TUR] klar")) s.conversation.turnsDone++;
    else if (t.startsWith("[TUR] avbruten")) { s.conversation.interrupted++; note(e, "tur avbruten"); }
    else if (t.startsWith("GeminiLive: disconnect")) {
      const reason = /reason=(\S+)/.exec(t)?.[1] ?? "okänd";
      s.conversation.disconnects[reason] = (s.conversation.disconnects[reason] ?? 0) + 1;
      note(e, `samtal avslutat (${reason})`);
    } else if (ERROR.test(t)) { s.problems.errorLines++; note(e, `FEL: ${t.slice(0, 160)}`); }
  }
  // Boot banners print several lines per restart; count restarts from perf uptime when available.
  if (!perf.length && bootLines) s.problems.reboots = Math.max(1, Math.round(bootLines / 2));
  if (omitted) s.timeline.push(`… ${omitted} fler händelser, se events`);
  s.firmware = [...fw];
  return s;
}

export function summaryText(s: TestSummary): string {
  const kb = (n: number | null) => (n === null ? "–" : `${Math.round(n / 1024)} kB`);
  const disc = Object.entries(s.conversation.disconnects).map(([r, n]) => `${r}×${n}`).join(", ") || "inga";
  return [
    `Test ${s.durationMin} min · firmware ${s.firmware.join(", ") || "okänd"} · ${s.counts.events} händelser (${s.counts.dropped} utelämnade)`,
    `Väckord: ${s.wake.detected} upptäckta, ${s.wake.rejectedLowSignal} avvisade (svag signal), ${s.wake.problems} problem, ${s.wake.ready} gånger redo`,
    `Samtal: ${s.conversation.sessions} startade, ${s.conversation.turnsDone} turer klara, ${s.conversation.interrupted} avbrutna, avslut: ${disc}`,
    `Problem: ${s.problems.reboots} omstarter, ${s.problems.crashes} krascher, ${s.problems.errorLines} felrader`,
    `Minne (lägsta): heap ${kb(s.memory.minHeap)}, största block ${kb(s.memory.minLargest)}, PSRAM ${kb(s.memory.minPsram)} · max ljudväntan ${s.memory.maxWaitMs ?? "–"} ms · ${s.memory.underruns} underflöden`,
  ].join("\n");
}
