import { describe, expect, it } from "vitest";
import { DEFAULT_APP, type Weather } from "./desk-app";
import { robotAppRequest, robotAppStatusSchema } from "./robot-app";
const weather: Weather = { fetchedAt: "2026-11-24T16:00:00Z", current: { temperature_2m: 4, weather_code: 0, wind_speed_10m: 3 }, daily: { temperature_2m_max: [5], temperature_2m_min: [0], precipitation_probability_max: [10] } };
describe("robot clock app transfer", () => {
  it("preserves the two app modes without executing a script", () => {
    expect(robotAppRequest(DEFAULT_APP, new Date("2026-11-24T16:00:00Z"), null).mode).toBe("widget");
    expect(robotAppRequest({ ...DEFAULT_APP, mode: "fullscreen" }, new Date("2026-11-24T16:00:00Z"), null).mode).toBe("fullscreen");
  });
  it("weather never becomes fresh again just because the app starts", () => {
    const r = robotAppRequest(DEFAULT_APP, new Date("2026-11-24T16:20:00Z"), weather);
    expect(r.weather_ttl_ms).toBe(600000); expect(r.weather).toBe("4°C · Klart");
    expect(robotAppRequest(DEFAULT_APP, new Date("2026-11-24T16:30:00Z"), weather).weather).toBe("");
  });
  it("rejects zones not implemented in the preserved v61 clock", () => {
    expect(() => robotAppRequest({ ...DEFAULT_APP, place: { ...DEFAULT_APP.place, timezone: "America/New_York" } }, new Date(), null)).toThrow();
  });
  it("does not trust a future weather timestamp", () => expect(robotAppRequest(DEFAULT_APP, new Date("2026-11-24T15:59:00Z"), weather).weather_ttl_ms).toBe(0));
  it("requires actual supported readback, not a generic ok response", () => {
    expect(robotAppStatusSchema.safeParse({ ok: true }).success).toBe(false);
    expect(robotAppStatusSchema.safeParse({ ok: true, supported: true, version: 1, active: true, mode: "fullscreen", id: DEFAULT_APP.id, suspended: false, weather_remaining_ms: 600000, persistent: false }).success).toBe(true);
  });
});