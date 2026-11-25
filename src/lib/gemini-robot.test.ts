import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ usb: true, bt: false, serial: vi.fn(), bluetooth: vi.fn() }));
vi.mock("./web-serial", () => ({ serialConnected: () => transport.usb, serialApi: transport.serial }));
vi.mock("./web-bluetooth", () => ({ bluetoothConnected: () => transport.bt, bluetoothApi: transport.bluetooth }));
import { robot, setGeminiRobotLogger } from "./gemini-robot";
import { DEFAULT_APP } from "./desk-app";
import { robotAppRequest } from "./robot-app";

beforeEach(() => { vi.clearAllMocks(); transport.usb = true; transport.bt = false; setGeminiRobotLogger(() => {}); });
describe("robot apps use the single control client", () => {
  const idle = { ok: true, supported: true, version: 1, active: false, mode: "off", id: "", suspended: false, weather_remaining_ms: 0, persistent: false };
  it("starts and reads back over USB", async () => {
    const payload = robotAppRequest(DEFAULT_APP, new Date("2026-11-24T16:00:00Z"), null);
    transport.serial.mockResolvedValue({ status: 200, data: { ...idle, active: true, mode: "widget", id: DEFAULT_APP.id } });
    expect((await robot.startApp(payload)).active).toBe(true); await robot.apps();
    expect(transport.serial.mock.calls).toEqual([["POST", "/api/apps", payload], ["GET", "/api/apps", undefined]]);
  });
  it("stops over Bluetooth when USB is absent", async () => {
    transport.usb = false; transport.bt = true;
    transport.bluetooth.mockResolvedValue({ status: 200, data: idle });
    expect((await robot.stopApp()).active).toBe(false);
    expect(transport.bluetooth).toHaveBeenCalledWith("POST", "/api/apps", { action: "stop" });
  });
  it("older firmware cannot masquerade as a supported app runtime", async () => {
    transport.serial.mockResolvedValue({ status: 404, data: { ok: false } });
    await expect(robot.apps()).rejects.toThrow("saknar stöd för klockappar");
    expect(transport.serial).toHaveBeenCalledTimes(1);
  });
});
describe("Wi-Fi configuration through shared transport", () => {
  it("saves the password before requesting a runtime change and reboot", async () => {
    transport.serial.mockResolvedValueOnce({ status: 200, data: { ok: true, updated: true } }).mockResolvedValueOnce({ status: 200, data: { ok: true, rebooting: true } });
    const log = vi.fn(); setGeminiRobotLogger(log);
    await robot.changeWifi("Test hotspot", "testpass123");
    expect(transport.serial.mock.calls).toEqual([["POST", "/api/secrets", { wifi_password: "testpass123" }], ["POST", "/api/runtime", { wifi_ssid: "Test hotspot", wifi_enabled: true, web_enabled: true, reboot: true }]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("testpass123");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Test hotspot");
  });
  it("never reboots if the password write failed even when HTTP was 200", async () => {
    transport.serial.mockResolvedValueOnce({ status: 200, data: { ok: true, updated: false } });
    await expect(robot.changeWifi("Home", "testpass123")).rejects.toThrow("Lösenordet kunde inte sparas");
    expect(transport.serial).toHaveBeenCalledTimes(1);
  });
  it("does not send invalid settings to hardware", async () => {
    await expect(robot.changeWifi("Home", "short")).rejects.toThrow();
    expect(transport.serial).not.toHaveBeenCalled();
  });
  it("uses Bluetooth when USB is absent", async () => {
    transport.usb = false; transport.bt = true;
    transport.bluetooth.mockResolvedValue({ status: 200, data: { ok: true, updated: true, rebooting: true } });
    await robot.changeWifi("Home", "testpass123");
    expect(transport.serial).not.toHaveBeenCalled(); expect(transport.bluetooth).toHaveBeenCalledTimes(2);
  });
  it("requests explicit stereo diagnostics over the same API path", async () => {
    transport.serial.mockResolvedValue({ status: 200, data: { audio_direction: { ok: true, left_rms: 120, right_rms: 100 } } });
    expect((await robot.stereoTest()).audio_direction?.left_rms).toBe(120);
    expect(transport.serial).toHaveBeenCalledWith("GET", "/api/sensors?audio=1", undefined);
  });
});

describe("live personality controls", () => {
  it("saves adjustable wake safeguards through the existing robot API without reboot", async () => {
    const personality = { wake_min_peak: 1500, wake_threshold_milli: 650 };
    transport.serial.mockResolvedValue({ status: 200, data: { ok: true, personality } });
    expect((await robot.savePersonality(personality)).personality).toEqual(personality);
    expect(transport.serial.mock.calls).toEqual([["POST", "/api/personality", personality]]);
  });
  it("saves proximity opt-in and its raw threshold without a reboot", async () => {
    const personality = { proximity_control: true, proximity_threshold: 10 };
    transport.serial.mockResolvedValue({ status: 200, data: { ok: true, personality } });
    expect((await robot.savePersonality(personality)).personality).toEqual(personality);
    expect(transport.serial.mock.calls).toEqual([["POST", "/api/personality", personality]]);
  });
  it("reads raw proximity and light validity over the shared sensor API", async () => {
    transport.serial.mockResolvedValue({ status: 200, data: { ltr553: { ps_raw: 14, als_valid: false } } });
    const result = await robot.proximityTest();
    expect(result.ltr553?.ps_raw).toBe(14);
    expect(result.ltr553?.als_valid).toBe(false);
    expect(transport.serial.mock.calls).toEqual([["GET", "/api/sensors", undefined]]);
  });
  it("sends disabled face details through the robot API without requesting a reboot", async () => {
    const personality = { status_text: false, listening_waves: false, eyebrows: false, cheeks: false };
    transport.serial.mockResolvedValue({ status: 200, data: { ok: true, personality } });
    const result = await robot.savePersonality(personality);
    expect(result.personality).toEqual(personality);
    expect(transport.serial.mock.calls).toEqual([["POST", "/api/personality", personality]]);
  });
});