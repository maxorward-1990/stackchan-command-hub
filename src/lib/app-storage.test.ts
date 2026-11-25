import { describe, expect, it } from "vitest";
import { IS_PREVIEW, storageKey } from "./app-storage";

describe("storageKey", () => {
  it("keeps real keys unchanged in the normal hub", () => {
    expect(storageKey("sc.notes", false)).toBe("sc.notes");
  });
  it("separates preview data from the real hub", () => {
    expect(storageKey("sc.notes", true)).toBe("preview:sc.notes");
  });
  it("is not a preview build under test", () => {
    expect(IS_PREVIEW).toBe(false);
  });
});
