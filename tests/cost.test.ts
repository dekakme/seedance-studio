import { describe, expect, it } from "vitest";
import { estimateCost, estimateForForm, estimateJobCost, outputDims } from "@/lib/cost";
import { DEFAULT_FORM } from "@/lib/studio-input";

const vid = "https://cdn.example.com/v.mp4";

describe("outputDims", () => {
  it("keeps the short side at the resolution", () => {
    expect(outputDims("720p", "16:9")).toEqual({ width: 1280, height: 720 });
    expect(outputDims("720p", "9:16")).toEqual({ width: 720, height: 1280 });
    expect(outputDims("480p", "1:1")).toEqual({ width: 480, height: 480 });
  });
});

describe("estimateCost", () => {
  it("matches Higgsfield's token formula", () => {
    // ceil(5 × 1280 × 720 × 24 / 1024) = 108000 tokens × $0.0214 / 1000
    expect(estimateCost({ resolution: "720p", aspectRatio: "16:9", outputSeconds: 5 })).toEqual({ tokens: 108000, usd: 2.3112 });
    expect(estimateCost({ resolution: "480p", aspectRatio: "16:9", outputSeconds: 4 }).usd).toBeCloseTo(0.82, 2);
  });

  it("bills input video seconds too", () => {
    const base = estimateCost({ resolution: "720p", aspectRatio: "16:9", outputSeconds: 5 });
    const withInput = estimateCost({ resolution: "720p", aspectRatio: "16:9", outputSeconds: 5, inputVideoSeconds: 5 });
    expect(withInput.tokens).toBe(base.tokens * 2);
  });
});

describe("estimateForForm", () => {
  it("uses the form duration and aspect ratio for text", () => {
    const e = estimateForForm("text", { ...DEFAULT_FORM, duration: 5 }, {});
    expect(e).toMatchObject({ usd: 2.3112, notes: [] });
  });

  it("adds the source video length and caps input video at 30s", () => {
    const form = { ...DEFAULT_FORM, duration: 5, media: { video_url: vid } };
    const e = estimateForForm("extend", form, { [vid]: 40 });
    const expected = estimateCost({ resolution: "720p", aspectRatio: "16:9", outputSeconds: 5, inputVideoSeconds: 30 });
    expect(e?.usd).toBe(expected.usd);
  });

  it("uses the source length as output for edit and flags unknown lengths", () => {
    const form = { ...DEFAULT_FORM, media: { video_url: vid } };
    expect(estimateForForm("edit", form, {})).toBeNull();
    const e = estimateForForm("edit", form, { [vid]: 6 });
    const expected = estimateCost({ resolution: "720p", aspectRatio: "16:9", outputSeconds: 6, inputVideoSeconds: 6 });
    expect(e?.usd).toBe(expected.usd);
    expect(e?.notes.length).toBeGreaterThan(0);
  });
});

describe("other models", () => {
  it("prices Genjutsu per started second of input video", () => {
    const form = { ...DEFAULT_FORM, resolution: "720p", media: { video_url: vid } };
    expect(estimateForForm("genjutsu", form, {})).toBeNull();
    // 5.2s rounds up to 6s × $0.681
    expect(estimateForForm("genjutsu", form, { [vid]: 5.2 })?.usd).toBeCloseTo(4.086, 3);
    expect(estimateForForm("genjutsu", { ...form, resolution: "480p" }, { [vid]: 5.2 })?.usd).toBeCloseTo(1.908, 3);
  });

  it("prices Kling per second of output by tier", () => {
    expect(estimateForForm("kling_std_text", { ...DEFAULT_FORM, prompt: "x", duration: 5 }, {})?.usd).toBeCloseTo(0.231, 4);
    expect(estimateForForm("kling_4k_image", { ...DEFAULT_FORM, duration: 10 }, {})?.usd).toBeCloseTo(2.31, 4);
    // duration is clamped to Kling's 15s max, like the payload
    expect(estimateForForm("kling_pro_text", { ...DEFAULT_FORM, prompt: "x", duration: 30 }, {})?.usd).toBeCloseTo(0.924, 4);
    expect(estimateJobCost({ mode: "kling_pro_text", params: { duration: 5 } })).toEqual({ usd: 0.308, partial: false });
  });
});

describe("estimateJobCost", () => {
  it("estimates text jobs from their params", () => {
    expect(estimateJobCost({ mode: "text", params: { duration: 4, resolution: "480p", aspect_ratio: "16:9" } })).toMatchObject({
      partial: false,
    });
  });

  it("marks jobs with input videos as partial and skips edit", () => {
    expect(estimateJobCost({ mode: "extend", params: { duration: 5, resolution: "720p", video_url: vid } })?.partial).toBe(true);
    expect(estimateJobCost({ mode: "edit", params: { resolution: "720p", video_url: vid } })).toBeNull();
  });
});
