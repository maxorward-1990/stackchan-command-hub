import { describe, expect, it } from "vitest";
import { EXAMPLE_APP, type RobotApp } from "./robot-apps";
import { CHUNK_BASE64, packageFiles, robotErrorText, sendPackage, toRobotPackage } from "./robot-app-transfer";

const jpeg = btoa(String.fromCharCode(0xff, 0xd8, ...Array.from({ length: 9000 }, (_, i) => i % 251), 0xff, 0xd9));
const app: RobotApp = { ...EXAMPLE_APP, id: "disco-1", name: "Disco åäö", actions: [{ kind: "text", text: "Hej" }, { kind: "image", name: "a.jpg", jpeg_base64: jpeg }] };

/** Mirrors the firmware's upload rules: offsets must continue the file, total bounds the size. */
function fakeRobot() {
  const files = new Map<string, number[]>();
  const calls: Record<string, unknown>[] = [];
  const post = async (b: Record<string, unknown>) => {
    calls.push(b);
    if (b["action"] === "upload") {
      const data = String(b["data"]);
      expect(data.length).toBeLessThanOrEqual(CHUNK_BASE64);
      expect(JSON.stringify({ ...b }).length + 40).toBeLessThan(6144);
      const have = b["offset"] === 0 ? [] : files.get(String(b["file"])) ?? [];
      if (have.length !== b["offset"]) throw new Error(`409 {"error":"wrong_offset"}`);
      const bytes = [...atob(data)].map(c => c.charCodeAt(0));
      files.set(String(b["file"]), [...have, ...bytes]);
      if (have.length + bytes.length > Number(b["total"])) throw new Error("past total");
      return { ok: true };
    }
    return { ok: true, installed: b["id"] };
  };
  return { files, calls, post };
}

describe("robot app transfer", () => {
  it("stores images as files named after their step and keeps the rest of the app", () => {
    const pkg = toRobotPackage(app);
    const robotApp = JSON.parse(pkg.json);
    expect(robotApp.enabled).toBe(true);
    expect(robotApp.actions[1]).toEqual({ kind: "image", name: "a.jpg", file: "disco-1_1.jpg" });
    expect(pkg.files.map(f => f.file)).toEqual(["disco-1.json", "disco-1_1.jpg"]);
    expect(new TextDecoder().decode(packageFiles(pkg)[0]?.bytes)).toBe(pkg.json);  // UTF-8 survives (åäö)
  });
  it("uploads every byte in order in USB-sized chunks, then installs", async () => {
    const pkg = toRobotPackage(app); const robot = fakeRobot(); const progress: number[] = [];
    await sendPackage(pkg, robot.post, d => progress.push(d));
    const img = robot.files.get("disco-1_1.jpg")!;
    expect(img.length).toBe(9004); expect(img[0]).toBe(0xff); expect(img[1]).toBe(0xd8);
    expect(new TextDecoder().decode(Uint8Array.from(robot.files.get("disco-1.json")!))).toBe(pkg.json);
    expect(robot.calls.at(-1)).toEqual({ action: "install", id: "disco-1" });
    expect(progress.at(-1)).toBe(robot.calls.length);
  });
  it("refuses apps the robot cannot hold", () => {
    expect(() => toRobotPackage({ ...app, id: "has space" })).toThrow(/Duplicera/);
    expect(() => toRobotPackage({ ...app, actions: Array(7).fill({ kind: "image", name: "", jpeg_base64: jpeg }) })).toThrow(/högst 6 bilder/);
  });
  it("explains robot errors and old firmware in Swedish", () => {
    expect(robotErrorText('Roboten svarade 507: {"ok":false,"error":"storage_limit"}')).toMatch(/1 MB/);
    expect(robotErrorText('Roboten svarade 404: {"ok":false,"error":"unknown_path"}')).toMatch(/v85/);
  });
});
