import { describe, expect, it } from "vitest";
import { DEFAULT_APP, clockText, importApps, readApps, snapshotText, weatherStale, type Weather } from "./desk-app";

describe("declarative desk apps", () => {
  it("round trips both extension and exclusive preview modes", () => {
    const apps = [DEFAULT_APP, { ...DEFAULT_APP, id: "full", mode: "fullscreen" }];
    expect(importApps(JSON.stringify({ version: 1, apps }))).toEqual(apps);
  });
  it("rejects executable or unsupported app types", () => {
    expect(() => importApps(JSON.stringify({ version: 1, apps: [{ ...DEFAULT_APP, kind: "script" }] }))).toThrow();
  });
  it("rejects invalid locations and timezones", () => {
    expect(() => importApps(JSON.stringify({ version: 1, apps: [{ ...DEFAULT_APP, place: { ...DEFAULT_APP.place, latitude: 200 } }] }))).toThrow();
    expect(readApps([{ ...DEFAULT_APP, place: { ...DEFAULT_APP.place, timezone: "invalid" } }])).toEqual([DEFAULT_APP]);
  });
  it("uses the selected place timezone for the clock", () => {
    expect(clockText(DEFAULT_APP, new Date("2026-11-24T16:00:00Z"))).toBe("17:00");
  });
  it("does not present stale weather as current in a robot snapshot", () => {
    const weather: Weather = { fetchedAt: "2026-11-24T15:00:00Z", current: { temperature_2m: 4, weather_code: 0, wind_speed_10m: 10 }, daily: { temperature_2m_max: [5], temperature_2m_min: [0], precipitation_probability_max: [20] } };
    expect(weatherStale(weather, Date.parse("2026-11-24T16:00:00Z"))).toBe(true);
    expect(snapshotText(DEFAULT_APP, new Date("2026-11-24T16:00:00Z"), weather)).not.toContain("4°C");
    expect(snapshotText(DEFAULT_APP, new Date("2026-11-24T15:01:00Z"), weather)).toContain("4°C");
  });
});