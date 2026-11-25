import { describe, expect, it } from "vitest";
import { requestSummary, tuyaKeyError } from "./robot-network";

describe("tuyaKeyError", () => {
  it("accepts a real-shaped Access ID and 32-char secret", () => {
    expect(tuyaKeyError("wrf5kxxeewp8qw5a9ywv", "a".repeat(32))).toBeNull();
  });
  it("rejects a short or symbol-containing Access ID", () => {
    expect(tuyaKeyError("short", "a".repeat(32))).not.toBeNull();
    expect(tuyaKeyError("wrf5kxxeewp8qw5a9yw!", "a".repeat(32))).not.toBeNull();
  });
  it("rejects the masked secret placeholder", () => {
    expect(tuyaKeyError("wrf5kxxeewp8qw5a9ywv", "*".repeat(32))).not.toBeNull();
  });
  it("never logs Tuya keys", () => {
    expect(requestSummary("/api/secrets", { tuya_client_secret: "x" })).toBe("[hemligheter dolda]");
  });
});
