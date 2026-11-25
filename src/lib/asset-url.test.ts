import { describe, expect, it } from "vitest";
import { assetUrl } from "./asset-url";

describe("assetUrl", () => {
  it("keeps root paths unchanged locally", () => {
    expect(assetUrl("/firmware/v76-app.bin", "/")).toBe("/firmware/v76-app.bin");
  });
  it("prefixes the GitHub Pages sub-path", () => {
    expect(assetUrl("/firmware/v76-app.bin", "/stackchan-command-hub/")).toBe("/stackchan-command-hub/firmware/v76-app.bin");
  });
  it("leaves absolute and relative URLs alone", () => {
    expect(assetUrl("https://example.com/a", "/x/")).toBe("https://example.com/a");
    expect(assetUrl("icon.png", "/x/")).toBe("icon.png");
  });
});
