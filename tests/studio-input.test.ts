import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, buildInput, formFromJob, refLimits, resolveMode } from "@/lib/studio-input";

const img = "https://cdn.example.com/i.png";
const vid = "https://cdn.example.com/v.mp4";
const aud = "https://cdn.example.com/a.mp3";

describe("resolveMode", () => {
  it("maps tabs to Seedance endpoints", () => {
    expect(resolveMode("create", "references", [])).toBe("text");
    expect(resolveMode("create", "references", [{ kind: "image", url: img }])).toBe("reference");
    expect(resolveMode("create", "frames", [])).toBe("image");
    expect(resolveMode("create", "extend", [])).toBe("extend");
    expect(resolveMode("edit", "references", [])).toBe("edit");
  });
});

describe("refLimits", () => {
  it("allows one fewer reference video when a source video counts", () => {
    expect(refLimits("text")).toEqual({ image: 30, video: 10, audio: 10 });
    expect(refLimits("edit")).toEqual({ image: 30, video: 9, audio: 10 });
    expect(refLimits("image")).toEqual({});
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
    const { tab, sub, form } = formFromJob({ mode: "reference", params });
    expect([tab, sub]).toEqual(["create", "references"]);
    expect(buildInput("reference", form)).toEqual(params);
  });
});
