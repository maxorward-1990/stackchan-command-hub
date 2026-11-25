import { z } from "zod";

const placeSchema = z.object({ name: z.string().min(1).max(80), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), timezone: z.string().max(80).refine((v) => { try { new Intl.DateTimeFormat("sv-SE", { timeZone: v }); return true; } catch { return false; } }) });
export const deskAppSchema = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(40), kind: z.literal("clock-weather"), mode: z.enum(["widget", "fullscreen"]), seconds: z.boolean(), place: placeSchema });
export type DeskApp = z.infer<typeof deskAppSchema>;
export type Place = z.infer<typeof placeSchema>;
export const DEFAULT_APP: DeskApp = { id: "desk-clock", name: "Klocka & Väder", kind: "clock-weather", mode: "widget", seconds: false, place: { name: "Stockholm", latitude: 59.3293, longitude: 18.0686, timezone: "Europe/Stockholm" } };
export const appBundleSchema = z.object({ version: z.literal(1), apps: z.array(deskAppSchema).min(1).max(20) });
export function importApps(text: string): DeskApp[] {
  if (text.length > 64000) throw new Error("Appfilen är för stor.");
  const bundle = appBundleSchema.safeParse(JSON.parse(text));
  if (!bundle.success) throw new Error("Ogiltig appfil. Endast klock-/väderappar stöds ännu.");
  return bundle.data.apps;
}
export function readApps(value: unknown): DeskApp[] {
  const parsed = z.array(deskAppSchema).max(20).safeParse(value);
  return parsed.success ? parsed.data : [DEFAULT_APP];
}
export const weatherSchema = z.object({ current: z.object({ temperature_2m: z.number().min(-100).max(70), weather_code: z.number().int().min(0).max(99), wind_speed_10m: z.number().min(0).max(500) }), daily: z.object({ temperature_2m_max: z.array(z.number()).min(1), temperature_2m_min: z.array(z.number()).min(1), precipitation_probability_max: z.array(z.number().min(0).max(100)).min(1) }) });
export type Weather = z.infer<typeof weatherSchema> & { fetchedAt: string };
export function weatherLabel(code: number) {
  if (code === 0) return "Klart";
  if (code <= 3) return "Molnigt";
  if (code <= 48) return "Dimma";
  if (code <= 67) return "Regn";
  if (code <= 77 || code === 85 || code === 86) return "Snö";
  if (code <= 82) return "Regnskurar";
  return "Åska";
}
export function clockText(app: DeskApp, now: Date, seconds = app.seconds) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: app.place.timezone, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) }).format(now);
}
export function weatherStale(weather: Weather, now = Date.now()) { return now - Date.parse(weather.fetchedAt) > 30 * 60000; }
export function snapshotText(app: DeskApp, now: Date, weather: Weather | null) {
  const lines = [`${clockText(app, now, false)} · ${app.place.name}`, new Intl.DateTimeFormat("sv-SE", { timeZone: app.place.timezone, day: "numeric", month: "short" }).format(now)];
  if (weather && !weatherStale(weather, now.getTime())) lines.push(`${Math.round(weather.current.temperature_2m)}°C · ${weatherLabel(weather.current.weather_code)}`);
  else lines.push("Väder ej aktuellt");
  return lines.join("\n");
}
export async function findPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 2) throw new Error("Skriv minst två bokstäver.");
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim().slice(0, 80))}&count=5&language=sv&format=json`, { signal });
  if (!response.ok) throw new Error("Ortsökningen svarar inte. Försök igen.");
  const data = z.object({ results: z.array(z.object({ name: z.string(), latitude: z.number(), longitude: z.number(), timezone: z.string(), country: z.string().optional(), admin1: z.string().optional() })).optional() }).parse(await response.json());
  return (data.results ?? []).map(p => placeSchema.parse({ ...p, name: [p.name, p.admin1, p.country].filter(Boolean).join(", ").slice(0, 80) }));
}
export async function fetchWeather(place: Place, signal: AbortSignal): Promise<Weather> {
  const params = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), current: "temperature_2m,weather_code,wind_speed_10m", daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max", timezone: place.timezone, forecast_days: "1" });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error("Vädret kunde inte hämtas. Försök igen senare.");
  return { ...weatherSchema.parse(await response.json()), fetchedAt: new Date().toISOString() };
}