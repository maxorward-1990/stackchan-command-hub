import { describe, expect, it } from "vitest";
import { guessReplyLanguage } from "./reply-language";

describe("guessReplyLanguage", () => {
  it("recognises the v79 diagnosis replies", () => {
    expect(guessReplyLanguage("Det blir 6.")).toBe("sv");
    expect(guessReplyLanguage("It's 6.")).toBe("en");
    expect(guessReplyLanguage("Klockan är 19:00 i Stockholm.")).toBe("sv");
    expect(guessReplyLanguage("Three plus three equals six.")).toBe("en");
  });
  it("returns null without a signal", () => {
    expect(guessReplyLanguage("6.")).toBeNull();
    expect(guessReplyLanguage("")).toBeNull();
  });
});
