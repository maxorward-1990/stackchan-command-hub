import { z } from "zod";
import { deskAppSchema, weatherLabel, type DeskApp, type Weather } from "./desk-app";

export const ROBOT_APP_ZONES = ["UTC", "Europe/Stockholm", "Asia/Tokyo", "Pacific/Port_Moresby"] as const;
export const robotAppStatusSchema = z.object({ ok: z.literal(true), supported: z.literal(true), version: z.literal(1), active: z.boolean(), mode: z.enum(["off", "widget", "fullscreen"]), id: z.string().max(80), suspended: z.boolean(), weather_remaining_ms: z.number().int().min(0).max(1800000), persistent: z.boolean(), saved: z.boolean().optional(), saved_place: z.string().max(48).optional() });
export type RobotAppStatus = z.infer<typeof robotAppStatusSchema>;
export function robotAppRequest(app: DeskApp, now: Date, weather: Weather | null) {
  deskAppSchema.parse(app);
  if (!ROBOT_APP_ZONES.some(zone => zone === app.place.timezone)) throw new Error("Den här testversionen stöder Stockholm, UTC, Tokyo och Port Moresby på roboten. Andra orter fungerar i förhandsvisningen.");
  const place = app.place.name.split(",")[0]?.trim() ?? app.place.name;
  if (new TextEncoder().encode(place).length > 48 || /[\x00-\x1f\x7f]/.test(place)) throw new Error("Ortnamnet är för långt för robotens skärm.");
  const fetchedAt = weather ? Date.parse(weather.fetchedAt) : NaN;
  const age = now.getTime() - fetchedAt;
  const ttl = Number.isFinite(age) && age >= 0 ? Math.max(0, 1800000 - age) : 0;
  return { action: "start" as const, version: 1 as const, id: app.id, mode: app.mode, seconds: app.seconds, place, timezone: app.place.timezone, epoch: Math.floor(now.getTime() / 1000), weather: weather && ttl > 0 ? `${Math.round(weather.current.temperature_2m)}°C · ${weatherLabel(weather.current.weather_code)}` : "", weather_ttl_ms: Math.floor(ttl) };
}