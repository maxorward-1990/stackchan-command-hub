import { describe, expect, it } from "vitest";
import {
  EXAMPLE_APP, UtteranceJoiner, appProblem, defaultAction, defaultTrigger, exportRobotApps, importRobotApps, mayStart,
  readRobotApps, readSensorSnapshot, runActions, waitForSpeech, groupProblem, groupsOf, saysMatch, sensorEdge, timeMatch, type Action, type ActionKind, type TriggerKind,
} from "./robot-apps";

describe("robot app format", () => {
  it("every default trigger/action except an empty image is valid", () => {
    const triggers: TriggerKind[] = ["button", "time", "says", "near", "light", "head_touch", "lifted", "put_down", "tipped", "knock", "battery_low", "power_on", "power_off"];
    const actions: ActionKind[] = ["led", "emotion", "gesture", "look", "text", "clear", "speak", "ask", "todo", "timer", "wait", "stop_talk", "reset", "photo", "describe", "listen", "sound", "overlay", "wait_for"];
    for (const t of triggers) for (const a of actions) expect(appProblem({ ...EXAMPLE_APP, triggers: [defaultTrigger(t)], actions: [defaultAction(a)] })).toBeNull();
    expect(appProblem({ ...EXAMPLE_APP, actions: [defaultAction("image")] })).toMatch(/välj en bild/);
    expect(appProblem({ ...EXAMPLE_APP, actions: [defaultAction("lights")] })).toMatch(/Steg 1/);
  });
  it("rejects unbounded or unknown content", () => {
    expect(appProblem({ ...EXAMPLE_APP, name: "" })).toMatch(/namn/);
    expect(appProblem({ ...EXAMPLE_APP, triggers: [] })).toMatch(/villkor/);
    expect(appProblem({ ...EXAMPLE_APP, actions: Array(21).fill(defaultAction("clear")) })).toMatch(/1–20 steg/);
    expect(appProblem({ ...EXAMPLE_APP, actions: [{ kind: "gesture", gesture: "self_destruct" }] })).not.toBeNull();
    expect(appProblem({ ...EXAMPLE_APP, actions: [{ kind: "script", code: "x" }] })).not.toBeNull();
    expect(appProblem({ ...EXAMPLE_APP, triggers: [{ kind: "time", at: "25:00", days: [1] }] })).not.toBeNull();
  });
  it("export/import round-trips and never imports apps as already enabled", () => {
    const apps = importRobotApps(exportRobotApps([{ ...EXAMPLE_APP, enabled: true }]));
    expect(apps).toHaveLength(1); expect(apps[0]?.enabled).toBe(false); expect(apps[0]?.actions).toEqual(EXAMPLE_APP.actions);
    expect(() => importRobotApps("{}")).toThrow(/StackChan-appfil/);
    expect(() => importRobotApps("nope")).toThrow(/JSON/);
    expect(readRobotApps([EXAMPLE_APP, { bad: 1 }])).toHaveLength(1);
  });
});

describe("triggers", () => {
  const sensors = { body_touch: { pressed_raw: false }, ltr553: { ps_ok: true, ps_raw: 20, als_ok: true, als_avg: 300 } };
  it("reads only successful sensor values", () => {
    expect(readSensorSnapshot(sensors)).toEqual({ ps_raw: 20, als_avg: 300, head_pressed: false });
    expect(readSensorSnapshot({ ltr553: { ps_ok: false, ps_raw: 2047 } }).ps_raw).toBeUndefined();
    expect(readSensorSnapshot(null)).toEqual({ ps_raw: undefined, als_avg: undefined, head_pressed: undefined });
  });
  it("fires once on the edge, not while the condition stays true or after an unknown reading", () => {
    const near = defaultTrigger("near"); // threshold 100
    expect(sensorEdge(near, null, { ps_raw: 500 })).toBe(false);
    expect(sensorEdge(near, { ps_raw: 20 }, { ps_raw: 500 })).toBe(true);
    expect(sensorEdge(near, { ps_raw: 500 }, { ps_raw: 600 })).toBe(false);
    expect(sensorEdge(near, { ps_raw: undefined }, { ps_raw: 500 })).toBe(false);
    const dark = { kind: "light", when: "dark", threshold: 20 } as const;
    expect(sensorEdge(dark, { als_avg: 300 }, { als_avg: 5 })).toBe(true);
    expect(sensorEdge({ ...dark, when: "bright", threshold: 200 }, { als_avg: 5 }, { als_avg: 300 })).toBe(true);
    expect(sensorEdge(defaultTrigger("head_touch"), { head_pressed: false }, { head_pressed: true })).toBe(true);
    expect(sensorEdge(defaultTrigger("button"), { head_pressed: false }, { head_pressed: true })).toBe(false);
  });
  it("matches clock time on the listed weekdays only", () => {
    const t = defaultTrigger("time"); // 07:00 Mon–Fri
    expect(timeMatch(t, new Date(2026, 10, 27, 7, 0, 30))).toBe("2026-10-27 07:00"); // Friday
    expect(timeMatch(t, new Date(2026, 10, 28, 7, 0))).toBeNull(); // Saturday
    expect(timeMatch(t, new Date(2026, 10, 27, 7, 1))).toBeNull();
  });
  it("matches whole spoken words, case and punctuation insensitive", () => {
    const t = { kind: "says", phrase: "Disco" } as const;
    expect(saysMatch(t, "Kör disco nu!")).toBe(true);
    expect(saysMatch(t, "DISCO.")).toBe(true);
    expect(saysMatch(t, "Vi går på discotek")).toBe(false);
    expect(saysMatch({ kind: "says", phrase: "god natt" }, "God natt, Stackchan")).toBe(true);
  });
  it("joins transcript fragments that arrive close together and ignores other lines", () => {
    const j = new UtteranceJoiner(2500);
    expect(j.push("GeminiLive: input transcript chars=4", 0)).toBeNull();
    expect(j.push("[DU] Kör", 0)).toBe("Kör");
    expect(j.push("[DU]  disco", 800)).toBe("Kör disco");
    expect(j.push("[DU] Hej", 5000)).toBe("Hej");
  });
  it("respects cooldown and one run at a time", () => {
    expect(mayStart(EXAMPLE_APP, undefined, 0, false)).toBe(true);
    expect(mayStart(EXAMPLE_APP, 0, 5000, false)).toBe(false); // cooldown 10 s
    expect(mayStart(EXAMPLE_APP, 0, 10000, false)).toBe(true);
    expect(mayStart(EXAMPLE_APP, undefined, 0, true)).toBe(false);
  });
});

describe("runner", () => {
  const sleep = async () => {};
  it("runs steps in order and reports the failing step", async () => {
    const seen: string[] = [];
    const ok = await runActions(EXAMPLE_APP.actions, async a => { seen.push(a.kind); }, new AbortController().signal, sleep);
    expect(ok).toEqual({ ok: true, done: EXAMPLE_APP.actions.length });
    expect(seen).toEqual(["led", "emotion", "text", "gesture", "led", "clear"]);
    const fail = await runActions(EXAMPLE_APP.actions, async a => { if (a.kind === "gesture") throw new Error("servo busy"); }, new AbortController().signal, sleep);
    expect(fail.ok).toBe(false); expect(fail.done).toBe(3); expect(fail.error).toMatch(/Steg 4 \(Gest \/ dans\): servo busy/);
  });
  it("stops when aborted, including during a wait", async () => {
    const c = new AbortController();
    const actions: Action[] = [{ kind: "wait", seconds: 30 }, { kind: "clear" }];
    const ran: string[] = [];
    const p = runActions(actions, async a => { ran.push(a.kind); }, c.signal);
    c.abort();
    expect(await p).toEqual({ ok: false, done: 0, error: "Stoppad." });
    expect(ran).toEqual([]);
  });
});

describe("speech wait", () => {
  const run = async (seq: (boolean | undefined)[]) => {
    let t = 0, i = 0;
    const opts = { now: () => t, sleep: async (ms: number) => { t += ms; }, pollMs: 500, startMs: 3000, quietMs: 1000, maxMs: 20000 };
    await waitForSpeech(async () => seq[Math.min(i++, seq.length - 1)], new AbortController().signal, opts);
    return { t, polls: i };
  };
  it("waits for the robot to start and then stop talking (short gaps are not the end)", async () => {
    const r = await run([false, false, true, true, false, true, true, false, false, false]);
    expect(r.polls).toBe(10);  // the single quiet poll between chunks did not end the wait
  });
  it("fails clearly when Gemini never starts talking", async () => {
    await expect(run([false])).rejects.toThrow(/började inte prata/);
  });
  it("never waits forever on a long answer", async () => {
    expect((await run([true])).t).toBe(20000);
  });
});

describe("v87 groups (samtidigt)", () => {
  const dance: Action[] = [{ kind: "emotion", emotion: "neutral" }, { kind: "led", mode: "rainbow", color: "#000000", with_previous: true },
    { kind: "speak", text: "Hej" }, { kind: "gesture", gesture: "little_dance", with_previous: true }, { kind: "wait", seconds: 2 }, { kind: "reset" }];
  it("groups steps marked with_previous and never joins the first step", () => {
    expect(groupsOf(dance).map(g => g.length)).toEqual([2, 2, 1, 1]);
    expect(groupsOf([{ kind: "clear", with_previous: true }]).length).toBe(1);
  });
  it("allows one motion, one voice and one screen item per group (same rule as the firmware)", () => {
    expect(groupProblem(dance)).toBeNull();
    expect(groupProblem([{ kind: "gesture", gesture: "nod_yes" }, { kind: "look", pan: 0, tilt: 0, with_previous: true }])).toMatch(/två rörelser/);
    expect(groupProblem([{ kind: "speak", text: "a" }, { kind: "listen", with_previous: true }])).toMatch(/tal/);
    expect(groupProblem([{ kind: "text", text: "a" }, { kind: "photo", show: true, with_previous: true }])).toMatch(/skärmen/);
    expect(appProblem({ ...EXAMPLE_APP, actions: [{ kind: "text", text: "a" }, { kind: "clear", with_previous: true }] })).toMatch(/skärmen/);
  });
  it("starts a group together and waits for all of it before the next group", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const slow = new Promise<void>(r => { release = r; });
    const p = runActions(dance.slice(2, 4).concat([{ kind: "clear" }]), async a => {
      order.push(`start ${a.kind}`);
      if (a.kind === "speak") await slow;
      order.push(`end ${a.kind}`);
    }, new AbortController().signal, async () => {});
    await new Promise(r => setTimeout(r, 0));
    expect(order).toEqual(["start speak", "start gesture", "end gesture"]);  // both started, clear waits
    release();
    expect(await p).toEqual({ ok: true, done: 3 });
    expect(order.at(-1)).toBe("end clear");
  });
});

describe("v88 overlay and wait_for", () => {
  it("keeps 'vänta på' alone and requires usable settings", () => {
    expect(groupProblem([{ kind: "clear" }, { kind: "wait_for", event: "knock", seconds: 5, otherwise: "stop", with_previous: true }])).toMatch(/Vänta på/);
    expect(groupProblem([{ kind: "wait_for", event: "near", seconds: 5, otherwise: "stop" }])).toMatch(/närhetsvärde/);
    expect(groupProblem([{ kind: "overlay", symbol: "none", seconds: 2 }])).toMatch(/symbol eller/);
    expect(groupProblem([{ kind: "speak", text: "Vad gör du?" }, { kind: "wait_for", event: "tipped", seconds: 20, otherwise: "stop" },
      { kind: "overlay", symbol: "heart", text: "Din idiot!", seconds: 3 }, { kind: "speak", text: "Din idiot!", with_previous: true }])).toBeNull();
  });
});
