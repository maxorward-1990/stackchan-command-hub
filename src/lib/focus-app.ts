import { z } from "zod";

export const focusConfigSchema = z.object({ focus_min: z.number().int().min(1).max(90), break_min: z.number().int().min(1).max(30), rounds: z.number().int().min(1).max(8), mode: z.enum(["widget", "fullscreen"]) });
export type FocusConfig = z.infer<typeof focusConfigSchema>;
export const DEFAULT_FOCUS: FocusConfig = { focus_min: 25, break_min: 5, rounds: 4, mode: "fullscreen" };
export const focusStatusSchema = z.object({ ok: z.literal(true), supported: z.literal(true), version: z.literal(1), phase: z.enum(["off", "focus", "break", "done"]), paused: z.boolean(), round: z.number().int().min(0).max(8), rounds: z.number().int().min(1).max(8), remaining_ms: z.number().int().min(0).max(90 * 60000), mode: z.enum(["off", "widget", "fullscreen"]), suspended: z.boolean(), saved: z.boolean(), persistent: z.boolean(), focus_min: z.number().int(), break_min: z.number().int() });
export type FocusStatus = z.infer<typeof focusStatusSchema>;
export function readFocus(value: unknown): FocusConfig { const p = focusConfigSchema.safeParse(value); return p.success ? p.data : DEFAULT_FOCUS; }
export function focusStartRequest(config: FocusConfig) {
  const c = focusConfigSchema.parse(config);
  return { action: "start" as const, version: 1 as const, ...c };
}
export function mmss(ms: number) { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
export function focusTotalMinutes(c: FocusConfig) { return c.focus_min * c.rounds + c.break_min * (c.rounds - 1); }
