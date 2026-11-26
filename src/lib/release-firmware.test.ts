import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error plain ESM tool without types
import { addRelease } from "../../tools/release-firmware.mjs";

const source = readFileSync("src/lib/firmware-releases.ts", "utf8");
const build = {
  version: "custom-v999",
  commit: "abcdef1234567",
  size: 3_000_000,
  md5: "0123456789abcdef0123456789abcdef",
  address: "0x10000",
};

describe("release-firmware", () => {
  it("adds an experimental entry with the recommendation's parts", () => {
    const { id, source: out } = addRelease(source, build, ["Test"], false, "2026-11-27");
    expect(id).toBe("v999");
    const entry = out.slice(
      out.indexOf('{ id: "v999",'),
      out.indexOf("] },", out.indexOf('{ id: "v999",')),
    );
    expect(entry).toContain("experimental: true");
    expect(entry).toContain("address: 0xc10000");
    expect(entry).toContain("Byggd av GitHub från commit abcdef1");
    expect(out).toContain('export const RECOMMENDED_ID = "v80";');
  });
  it("moves the recommendation with --recommend", () => {
    const { source: out } = addRelease(source, build, [], true, "2026-11-27");
    expect(out).toContain('export const RECOMMENDED_ID = "v999";');
    expect(out).not.toContain('{ id: "v999", experimental');
  });
  it("refuses duplicates, wrong addresses and bad checksums", () => {
    expect(() => addRelease(source, { ...build, version: "custom-v80" }, [], false, "x")).toThrow();
    expect(() => addRelease(source, { ...build, address: "0x0" }, [], false, "x")).toThrow();
    expect(() => addRelease(source, { ...build, md5: "nope" }, [], false, "x")).toThrow();
  });
});
