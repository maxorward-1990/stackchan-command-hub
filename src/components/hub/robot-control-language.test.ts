import { describe, expect, it } from "vitest";
import { migrateLanguagePrompt } from "./RobotControl";

describe("migrateLanguagePrompt", () => {
  it("removes the forced-Swedish sentence from old saved profiles", () => {
    const old = "Tala uteslutande på ren, naturlig svenska. Blanda aldrig in norska eller danska ord eller uttal. Använd neutral rikssvenska (standardsvenska) med neutralt uttal, utan regional dialekt eller brytning som småländska, skånska eller norrländska. Svara kort.";
    const out = migrateLanguagePrompt(old);
    expect(out).not.toContain("uteslutande");
    expect(out).toContain("samma språk som användaren");
    expect(out.endsWith(" Svara kort.")).toBe(true);
    expect(migrateLanguagePrompt("Egen prompt")).toBe("Egen prompt");
  });
});
