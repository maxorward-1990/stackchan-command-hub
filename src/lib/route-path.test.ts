import { describe, expect, it } from "vitest";
import { normalizePath } from "./route-path";

describe("normalizePath", () => {
  it("strips the trailing slash from routes", () => {
    expect(normalizePath("/diagnostics/")).toBe("/diagnostics");
    expect(normalizePath("/diagnostics")).toBe("/diagnostics");
  });
  it("keeps the root path", () => {
    expect(normalizePath("/")).toBe("/");
  });
});
