import { describe, expect, it } from "vitest";
import { consoleCommand } from "./console-command";

describe("USB console dispatch", () => {
  it("sends search gotland directly, without say", () => expect(consoleCommand("search gotland")).toBe("search gotland"));
  it("sends status directly", () => expect(consoleCommand("status")).toBe("status"));
  it("preserves API requests", () => expect(consoleCommand('api #1 GET /api/sensors?audio=1')).toBe('api #1 GET /api/sensors?audio=1'));
  it("recognizes raw commands regardless of case", () => expect(consoleCommand("  SEARCH Gotland  ")).toBe("SEARCH Gotland"));
  it("does not double-prefix explicit speech", () => expect(consoleCommand("say Hej")).toBe("say Hej"));
  it("still sends ordinary questions to Gemini", () => expect(consoleCommand("Hur många bor på Gotland?")).toBe("say Hur många bor på Gotland?"));
  it("does not mistake a command prefix for a command", () => expect(consoleCommand("statusrapport tack")).toBe("say statusrapport tack"));
  it("ignores blank submissions", () => expect(consoleCommand(" \n ")).toBe(""));
});