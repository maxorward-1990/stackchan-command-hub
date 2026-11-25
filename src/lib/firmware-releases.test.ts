import { describe, expect, it } from "vitest";
import { RELEASES, OFFERED, flashPlan, addHistory, LATEST, RESTORE, WAKE_MODEL_MAX, LITTLEFS_ADDRESS } from "./firmware-releases";

describe("flash safety", () => {
  it("app updates always go to 0x10000", () => {
    for (const r of RELEASES.filter((r) => r.kind === "app")) expect(flashPlan(r).address).toBe(0x10000);
  });
  it("only the recovery image goes to 0x0", () => {
    const rec = RELEASES.find((r) => r.kind === "recovery");
    expect(rec && flashPlan(rec).address).toBe(0);
  });
  it("never erases flash (keeps Wi-Fi, key and prompts)", () => {
    for (const r of RELEASES) expect(flashPlan(r).eraseAll).toBe(false);
  });
  it("v76 is the official recommendation", () => expect(LATEST.id).toBe("v76"));
  it("v61 remains the independent safe restore", () => expect(RESTORE.id).toBe("v61"));
  it("v79 is an experimental camera-clock build, still not the recommendation", () => {
    const release = RELEASES.find(r => r.id === "v79");
    expect(release?.experimental).toBe(true);
    expect(release?.md5).toBe("797b5451c53890792d71ec11852d7496");
    expect(release?.size).toBe(3113584);
    expect(release && flashPlan(release).images[0]?.address).toBe(0x10000);
    expect(LATEST.id).toBe("v76");
  });
  it("v78 is an experimental PSRAM-camera build, still not the recommendation", () => {
    const release = RELEASES.find(r => r.id === "v78");
    expect(release?.experimental).toBe(true);
    expect(release?.md5).toBe("38e5d4b9b933727177a0c3a09d30eb01");
    expect(release?.size).toBe(3112912);
    expect(release && flashPlan(release).images[0]?.address).toBe(0x10000);
    expect(LATEST.id).toBe("v76");
  });
  it("v77 is an experimental diagnostic-mode build next to the recommended v76", () => {
    const release = RELEASES.find(r => r.id === "v77");
    expect(release?.experimental).toBe(true);
    expect(release?.md5).toBe("bd4fd3e56482bedae3ad9d94fe525b26");
    expect(release?.size).toBe(3112400);
    expect(release?.parts).toEqual(RELEASES.find(r => r.id === "v76")?.parts);
    expect(release && flashPlan(release).images[0]?.address).toBe(0x10000);
    expect(LATEST.id).toBe("v76");
  });
  it("v76 replaces the failed v75 experiment without changing restore or settings layout", () => {
    const release = RELEASES.find(r => r.id === "v76");
    expect(release?.experimental).not.toBe(true);
    expect(release?.version).toBe("custom-v76");
    expect(release?.md5).toBe("ea9d15aad7621697a2c53e1aec2d971e");
    expect(release?.size).toBe(3110592);
    expect(release?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(release && flashPlan(release).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(release && flashPlan(release).eraseAll).toBe(false);
    expect(OFFERED.some(r => r.id === "v76")).toBe(true);
    expect(OFFERED.some(r => r.id === "v75")).toBe(false);
    expect(RESTORE.id).toBe("v61");
    expect(RELEASES.find(r => r.id === "v71")?.md5).toBe("1b2817bb8f9c5a1dcf2ab30916a3caa2");
  });
  it("v73 corrects wake readback without replacing restore or changing flash layout", () => {
    const release = RELEASES.find(r => r.id === "v73");
    expect(release?.experimental).toBe(true);
    expect(release?.version).toBe("custom-v73");
    expect(release?.md5).toBe("24e3148e1d52e106727f724b1ff2abb1");
    expect(release?.size).toBe(3110320);
    expect(release?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(release && flashPlan(release).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(release && flashPlan(release).eraseAll).toBe(false);
    expect(OFFERED.some(r => r.id === "v73")).toBe(true);
    expect(OFFERED.some(r => r.id === "v72")).toBe(false);
    expect(RESTORE.id).toBe("v61");
    expect(RELEASES.find(r => r.id === "v71")?.md5).toBe("1b2817bb8f9c5a1dcf2ab30916a3caa2");
  });
  it("v72 threshold experiment preserves v61 restore, v71 reference and settings layout", () => {
    const test = RELEASES.find(r => r.id === "v72");
    expect(test?.experimental).toBe(true);
    expect(test?.version).toBe("custom-v72");
    expect(test?.md5).toBe("149c5c489d85f80f78da3894df7ee25d");
    expect(test?.size).toBe(3110192);
    expect(test?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(test && flashPlan(test).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(test && flashPlan(test).eraseAll).toBe(false);
    expect(RELEASES.find(r => r.id === "v71")?.md5).toBe("1b2817bb8f9c5a1dcf2ab30916a3caa2");
    expect(RESTORE.id).toBe("v61");
  });
  it("app experiment never replaces the v61 restore target or its settings layout", () => {
    const test = RELEASES.find(r => r.id === "v66");
    expect(test?.experimental).toBe(true);
    expect(test?.md5).toBe("45499caee65c1ea44f07900a87c0f9b1");
    expect(test?.size).toBe(3087648);
    expect(test?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(test && flashPlan(test).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(test && flashPlan(test).eraseAll).toBe(false);
    expect(RESTORE.version).toBe("custom-v61");
    expect(OFFERED.find(r => r.kind === "app")?.id).toBe("v76");
  });
  it("v67 app menu test build keeps the v61 layout and never becomes the recommendation", () => {
    const test = RELEASES.find(r => r.id === "v67");
    expect(test?.experimental).toBe(true);
    expect(test?.md5).toBe("a6f10eb90e3dcbcf6371d5208c7c947e");
    expect(test?.size).toBe(3094080);
    expect(test?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(test && flashPlan(test).eraseAll).toBe(false);
    expect(RESTORE.id).toBe("v61");
  });
  it("v69 timer voice/touch test build keeps the v61 layout and never becomes the recommendation", () => {
    const test = RELEASES.find(r => r.id === "v69");
    expect(test?.experimental).toBe(true);
    expect(test?.md5).toBe("545b87a79589f3ca3a12f3a1a4091d67");
    expect(test?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(test && flashPlan(test).images[0]?.address).toBe(0x10000);
    expect(test && flashPlan(test).eraseAll).toBe(false);
    expect(RESTORE.id).toBe("v61");
  });
  it("v68 focus timer test build keeps the v61 layout and never becomes the recommendation", () => {
    const test = RELEASES.find(r => r.id === "v68");
    expect(test?.experimental).toBe(true);
    expect(test?.md5).toBe("dced5094cb30e925c98b21e9e37d91eb");
    expect(test?.size).toBe(3105056);
    expect(test?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(test && flashPlan(test).images[0]?.address).toBe(0x10000);
    expect(test && flashPlan(test).eraseAll).toBe(false);
    expect(RESTORE.id).toBe("v61");
  });
  it("withdrawn v62-v65 are never offered", () => {
    for (const id of ["v62", "v63", "v64", "v65"]) expect(OFFERED.some((r) => r.id === id)).toBe(false);
  });
  it("v64 retains settings, wake model and v63 rollback with verified binary", () => {
    const v64 = RELEASES.find(r => r.id === "v64");
    expect(v64?.parts).toEqual(RELEASES.find(r => r.id === "v63")?.parts);
    expect(v64 && flashPlan(v64).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v64 && flashPlan(v64).eraseAll).toBe(false);
    expect(v64?.md5).toBe("eab5b4f4cb67e143a152d9d157b963a0");
    expect(v64?.size).toBe(3085568);
    expect(RELEASES.find(r => r.id === "v63")?.md5).toBe("63514415b52ee194d9d71c5c692e0c95");
  });
  it("v63 preserves settings, wake model and v62 rollback", () => {
    const v63 = RELEASES.find(r => r.id === "v63");
    expect(v63?.parts).toEqual(RELEASES.find(r => r.id === "v62")?.parts);
    expect(v63 && flashPlan(v63).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v63 && flashPlan(v63).eraseAll).toBe(false);
    expect(v63?.md5).toBe("63514415b52ee194d9d71c5c692e0c95");
    expect(v63?.size).toBe(3083728);
    expect(RELEASES.find(r => r.id === "v62")?.md5).toBe("96396ccac155a3a813f7647b64a6e1e5");
  });
  it("v62 preserves settings, the wake model and the v61 rollback", () => {
    const v62 = RELEASES.find(r => r.id === "v62");
    expect(v62?.parts).toEqual(RELEASES.find(r => r.id === "v61")?.parts);
    expect(v62 && flashPlan(v62).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v62 && flashPlan(v62).eraseAll).toBe(false);
    expect(RELEASES.find(r => r.id === "v61")?.md5).toBe("04eba1aed7207425c1a40bb0d22311fb");
  });
  it("v61 retains the storage layout and v60 rollback", () => {
    const v61 = RELEASES.find(r => r.id === "v61");
    expect(v61?.parts).toEqual(RELEASES.find(r => r.id === "v50")?.parts);
    expect(v61 && flashPlan(v61).images.map(i => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v61 && flashPlan(v61).eraseAll).toBe(false);
    expect(v61?.md5).toBe("04eba1aed7207425c1a40bb0d22311fb");
    expect(v61?.size).toBe(3081136);
    expect(RELEASES.find(r => r.id === "v60")?.md5).toBe("cb5ca7ef2ab277f940a74a4604182c28");
  });
  it("v60 preserves settings and v59 rollback with the verified binary", () => {
    const v60 = RELEASES.find((r) => r.id === "v60");
    expect(v60?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v60 && flashPlan(v60).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v60 && flashPlan(v60).eraseAll).toBe(false);
    expect(v60?.md5).toBe("cb5ca7ef2ab277f940a74a4604182c28");
    expect(v60?.size).toBe(3077136);
    expect(RELEASES.find((r) => r.id === "v59")?.md5).toBe("cd6169808e34e39f9fd2a269adfcee36");
  });
  it("v49 stays available as rollback", () => expect(RELEASES.find((r) => r.id === "v49")?.file).toBe("/firmware/v49-app.bin"));
  it("extra images only go to the partition table (0x8000) or model partition (0xC10000)", () => {
    for (const r of RELEASES) for (const p of r.parts ?? []) expect([0x8000, 0xc10000]).toContain(p.address);
  });
  it("wake model fits its 512 KiB partition and never reaches LittleFS", () => {
    for (const r of RELEASES) for (const p of r.parts ?? []) if (p.address === 0xc10000) {
      expect(p.size).toBeLessThanOrEqual(WAKE_MODEL_MAX);
      expect(p.address + p.size).toBeLessThanOrEqual(LITTLEFS_ADDRESS);
    }
  });
  it("v50 flashes app at 0x10000 plus table and model, without erase", () => {
    const v50 = RELEASES.find((r) => r.id === "v50");
    expect(v50 && flashPlan(v50).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
  });
  it("v51 uses the unchanged wake model/table and preserves settings", () => {
    const v51 = RELEASES.find((r) => r.id === "v51");
    const v50 = RELEASES.find((r) => r.id === "v50");
    expect(v51?.parts).toEqual(v50?.parts);
    expect(v51 && flashPlan(v51).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v51 && flashPlan(v51).eraseAll).toBe(false);
  });
  it("v52 keeps the wake partitions and v49 rollback unchanged", () => {
    const v52 = RELEASES.find((r) => r.id === "v52");
    expect(v52?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v52 && flashPlan(v52).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v52 && flashPlan(v52).eraseAll).toBe(false);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("v53 retains settings and the original v49 rollback", () => {
    const v53 = RELEASES.find((r) => r.id === "v53");
    expect(v53?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v53 && flashPlan(v53).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v53 && flashPlan(v53).eraseAll).toBe(false);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("v54 preserves model, settings and v49 rollback", () => {
    const v54 = RELEASES.find((r) => r.id === "v54");
    expect(v54?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v54 && flashPlan(v54).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v54 && flashPlan(v54).eraseAll).toBe(false);
    expect(v54?.md5).toBe("3a0c801375b33108d0dc7c9cf0528ad7");
    expect(v54?.size).toBe(3068816);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("v55 preserves settings, model and the working rollback", () => {
    const v55 = RELEASES.find((r) => r.id === "v55");
    expect(v55?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v55 && flashPlan(v55).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v55 && flashPlan(v55).eraseAll).toBe(false);
    expect(v55?.md5).toBe("5bd5d75bf7b77b8cf64220997e1f948e");
    expect(v55?.size).toBe(3070048);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("v59 preserves settings, model, rollback and verifies its binary", () => {
    const v59 = RELEASES.find((r) => r.id === "v59");
    expect(v59?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v59 && flashPlan(v59).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v59 && flashPlan(v59).eraseAll).toBe(false);
    expect(v59?.md5).toBe("cd6169808e34e39f9fd2a269adfcee36");
    expect(v59?.size).toBe(3076464);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("v58 keeps settings, model and app address", () => {
    const v58 = RELEASES.find((r) => r.id === "v58");
    expect(v58 && flashPlan(v58).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v58 && flashPlan(v58).eraseAll).toBe(false);
    expect(v58?.md5).toBe("06e8f03952d61e93dc13ab22cfd99a91");
  });
  it("v57 keeps settings, model and v49 unchanged", () => {
    const v57 = RELEASES.find((r) => r.id === "v57");
    expect(v57?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v57 && flashPlan(v57).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v57 && flashPlan(v57).eraseAll).toBe(false);
    expect(v57?.md5).toBe("8d453a1567dc589f5b7bb76a8e9511fa");
    expect(v57?.size).toBe(3075056);
  });
  it("v56 keeps settings, model and v49 unchanged", () => {
    const v56 = RELEASES.find((r) => r.id === "v56");
    expect(v56?.parts).toEqual(RELEASES.find((r) => r.id === "v50")?.parts);
    expect(v56 && flashPlan(v56).images.map((i) => i.address)).toEqual([0x10000, 0x8000, 0xc10000]);
    expect(v56 && flashPlan(v56).eraseAll).toBe(false);
    expect(v56?.md5).toBe("da306bfc605436fb18fa12ebf142eb71");
    expect(v56?.size).toBe(3073984);
    expect(RELEASES.find((r) => r.id === "v49")?.md5).toBe("ea01a4c89be29afe91b243d4aa5c59e0");
  });
  it("history keeps newest first and at most 30", () => {
    let h = Array.from({ length: 30 }, (_, i) => ({ id: "v14", version: "x", at: String(i), ok: true }));
    h = addHistory(h, { id: "v17", version: "y", at: "new", ok: true });
    expect(h).toHaveLength(30);
    expect(h[0]?.id).toBe("v17");
  });
});

import { isWithdrawnVersion as _isWithdrawn } from "./firmware-releases";
import { describe as _d, it as _it, expect as _e } from "vitest";
_d("robot-reported version check", () => {
  _it("flags v75 as withdrawn after the settings-save lockup", () => { _e(_isWithdrawn("custom-v75")).toBe(true); });
  _it("flags v72 as withdrawn after real robot wake failure", () => { _e(_isWithdrawn("custom-v72")).toBe(true); });
  _it("flags v65 on the robot as withdrawn", () => { _e(_isWithdrawn("custom-v65")).toBe(true); });
  _it("treats v61 on the robot as fine", () => { _e(_isWithdrawn("custom-v61")).toBe(false); });
});
