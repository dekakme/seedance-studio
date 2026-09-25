import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, buildInput, formFromJob, refLimits, resolveMode } from "@/lib/studio-input";

const img = "https://cdn.example.com/i.png";
const vid = "https://cdn.example.com/v.mp4";
const aud = "https://cdn.example.com/a.mp3";

describe("resolveMode", () => {
  it("maps Seedance tabs to endpoints", () => {
    expect(resolveMode("create", "references", [])).toBe("text");
    expect(resolveMode("create", "references", [{ kind: "image", url: img }])).toBe("reference");
    expect(resolveMode("create", "frames", [])).toBe("image");
    expect(resolveMode("create", "extend", [])).toBe("extend");
    expect(resolveMode("edit", "references", [])).toBe("edit");
  });

  it("maps Kling and Genjutsu", () => {
    expect(resolveMode("create", "references", [], "kling", "std")).toBe("kling_std_text");
    expect(resolveMode("create", "frames", [], "kling", "pro")).toBe("kling_pro_image");
    expect(resolveMode("create", "extend", [], "kling", "std")).toBe("kling_std_text");
    expect(resolveMode("create", "frames", [], "kling", "4k")).toBe("kling_4k_image");
    expect(resolveMode("create", "motion", [], "genjutsu")).toBe("genjutsu");
    expect(resolveMode("create", "swap", [], "genjutsu")).toBe("genjutsu_swap");
    expect(resolveMode("create", "references", [], "minimax")).toBe("minimax_text");
    expect(resolveMode("create", "references", [{ kind: "video", url: vid }], "minimax")).toBe("minimax_reference");
    expect(resolveMode("create", "frames", [], "minimax")).toBe("minimax_image");
    // a sub-tab from another model falls back to motion transfer
    expect(resolveMode("create", "references", [], "genjutsu")).toBe("genjutsu");
  });
});

describe("refLimits", () => {
  it("allows one fewer reference video when a source video counts", () => {
    expect(refLimits("text")).toEqual({ image: 30, video: 10, audio: 10 });
    expect(refLimits("edit")).toEqual({ image: 30, video: 9, audio: 10 });
    expect(refLimits("image")).toEqual({});
    expect(refLimits("genjutsu")).toEqual({ image: 8 });
    expect(refLimits("genjutsu_swap")).toEqual({ image: 8 });
    expect(refLimits("minimax_text")).toEqual({ image: 9, video: 3, audio: 3 });
    expect(refLimits("kling_std_text")).toEqual({});
  });
});

describe("buildInput", () => {
  it("sends only the fields the mode supports", () => {
    const form = { ...DEFAULT_FORM, prompt: "  waves  ", media: { video_url: vid, image_url: img } };
    expect(buildInput("edit", form)).toEqual({
      prompt: "waves",
      video_url: vid,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("includes text-only options for text mode and skips an empty prompt elsewhere", () => {
    expect(buildInput("text", { ...DEFAULT_FORM, prompt: "cat" })).toMatchObject({
      prompt: "cat",
      duration: 5,
      aspect_ratio: "16:9",
      output_format: "mp4",
    });
    expect(buildInput("image", { ...DEFAULT_FORM, media: { image_url: img } })).not.toHaveProperty("prompt");
  });

  it("splits ordered references into per-kind arrays", () => {
    const refs = [
      { kind: "image" as const, url: img },
      { kind: "audio" as const, url: aud },
      { kind: "image" as const, url: `${img}?2` },
    ];
    const input = buildInput("reference", { ...DEFAULT_FORM, prompt: "x", refs });
    expect(input.image_urls).toEqual([img, `${img}?2`]);
    expect(input.audio_urls).toEqual([aud]);
    expect(input).not.toHaveProperty("video_urls");
  });

  it("speaks Kling's fields and clamps values to its limits", () => {
    const form = { ...DEFAULT_FORM, prompt: "x", duration: 30, aspect_ratio: "21:9", generate_audio: false, cfg_scale: 0.7 };
    expect(buildInput("kling_pro_text", form)).toEqual({ prompt: "x", sound: "off", cfg_scale: 0.7, duration: 15, aspect_ratio: "16:9" });
  });

  it("builds a Genjutsu payload from the source video and images", () => {
    const form = { ...DEFAULT_FORM, media: { video_url: vid }, refs: [{ kind: "image" as const, url: img }] };
    expect(buildInput("genjutsu", form)).toEqual({ video_url: vid, image_urls: [img], resolution: "720p" });
  });
});

describe("formFromJob", () => {
  it("round-trips a job's params back into the same input", () => {
    const params = {
      prompt: "@Image1 walks",
      duration: 8,
      aspect_ratio: "9:16",
      resolution: "480p",
      bitrate_mode: "standard",
      generate_audio: false,
      image_urls: [img],
      video_urls: [vid],
    };
    const preset = formFromJob({ mode: "reference", params });
    expect([preset.tab, preset.sub, preset.model]).toEqual(["create", "references", "seedance"]);
    expect(buildInput("reference", preset.form)).toEqual(params);
  });

  it("restores Kling tier and Genjutsu mode", () => {
    const kling = formFromJob({ mode: "kling_pro_image", params: { image_url: img, sound: "off", duration: 7, cfg_scale: 0.3 } });
    expect([kling.tab, kling.sub, kling.model, kling.tier]).toEqual(["create", "frames", "kling", "pro"]);
    expect(buildInput("kling_pro_image", kling.form)).toEqual({ image_url: img, sound: "off", duration: 7, cfg_scale: 0.3 });
    const swap = formFromJob({ mode: "genjutsu_swap", params: { video_url: vid, image_urls: [img] } });
    expect([swap.tab, swap.sub, swap.model]).toEqual(["create", "swap", "genjutsu"]);
    expect(formFromJob({ mode: "genjutsu", params: { video_url: vid, image_urls: [img] } }).sub).toBe("motion");
    const minimax = formFromJob({ mode: "minimax_image", params: { prompt: "x", image_url: img } });
    expect([minimax.model, minimax.sub]).toEqual(["minimax", "frames"]);
  });
});
