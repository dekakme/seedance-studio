import { describe, expect, it } from "vitest";
import { parseJobInput } from "@/lib/schemas";

const img = "https://cdn.example.com/a.png";
const vid = "https://cdn.example.com/a.mp4";
const aud = "https://cdn.example.com/a.mp3";
const many = (url: string, n: number) => Array.from({ length: n }, (_, i) => `${url}?${i}`);
const errorPaths = (r: ReturnType<typeof parseJobInput>) => (r.ok ? [] : r.errors.map((e) => e.path));

describe("parseJobInput", () => {
  it("applies text-to-video defaults", () => {
    expect(parseJobInput("text", { prompt: "a cat" })).toEqual({
      ok: true,
      payload: {
        prompt: "a cat",
        duration: 5,
        aspect_ratio: "16:9",
        output_format: "mp4",
        resolution: "720p",
        bitrate_mode: "high",
        generate_audio: true,
      },
    });
  });

  it("requires a prompt for text", () => {
    expect(parseJobInput("text", {})).toEqual({ ok: false, errors: [{ path: "prompt", message: "Prompt is required" }] });
  });

  it("rejects durations outside 4-30", () => {
    expect(errorPaths(parseJobInput("text", { prompt: "x", duration: 3 }))).toContain("duration");
    expect(errorPaths(parseJobInput("text", { prompt: "x", duration: 31 }))).toContain("duration");
    expect(parseJobInput("text", { prompt: "x", duration: 30 }).ok).toBe(true);
  });

  it("rejects fields that do not belong to the mode", () => {
    expect(parseJobInput("text", { prompt: "x", image_url: img }).ok).toBe(false);
  });

  it("requires image_url for image mode and drops an empty prompt", () => {
    expect(errorPaths(parseJobInput("image", {}))).toContain("image_url");
    const r = parseJobInput("image", { image_url: img, prompt: "" });
    expect(r.ok && r.payload).toEqual({
      image_url: img,
      duration: 5,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("only accepts https media urls", () => {
    expect(errorPaths(parseJobInput("image", { image_url: "http://cdn.example.com/a.png" }))).toContain("image_url");
  });

  it("needs at least one reference for reference mode", () => {
    expect(parseJobInput("reference", { prompt: "x" }).ok).toBe(false);
    expect(parseJobInput("reference", { prompt: "x", audio_urls: [aud] }).ok).toBe(true);
  });

  it("enforces reference array limits", () => {
    expect(errorPaths(parseJobInput("reference", { prompt: "x", image_urls: many(img, 31) }))).toContain("image_urls");
    expect(parseJobInput("reference", { prompt: "x", image_urls: many(img, 30) }).ok).toBe(true);
  });

  it("caps extra videos at 9 for edit because the source counts", () => {
    expect(errorPaths(parseJobInput("edit", { prompt: "x", video_url: vid, video_urls: many(vid, 10) }))).toContain("video_urls");
    expect(parseJobInput("edit", { prompt: "x", video_url: vid, video_urls: many(vid, 9) }).ok).toBe(true);
  });

  it("omits empty reference arrays and has no duration for edit", () => {
    const r = parseJobInput("edit", { prompt: "x", video_url: vid });
    expect(r.ok && r.payload).toEqual({
      prompt: "x",
      video_url: vid,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("accepts a duration for extend", () => {
    const r = parseJobInput("extend", { prompt: "x", video_url: vid, duration: 8 });
    expect(r.ok && r.payload.duration).toBe(8);
  });
});

describe("Kling 3.0", () => {
  it("applies text-to-video defaults", () => {
    expect(parseJobInput("kling_std_text", { prompt: "x" })).toEqual({
      ok: true,
      payload: { prompt: "x", sound: "on", cfg_scale: 0.5, duration: 5, aspect_ratio: "16:9" },
    });
  });

  it("enforces Kling's own duration and aspect ratio limits", () => {
    expect(errorPaths(parseJobInput("kling_pro_text", { prompt: "x", duration: 16 }))).toContain("duration");
    expect(errorPaths(parseJobInput("kling_pro_text", { prompt: "x", aspect_ratio: "4:3" }))).toContain("aspect_ratio");
    expect(parseJobInput("kling_pro_text", { prompt: "x", duration: 3, aspect_ratio: "1:1" }).ok).toBe(true);
  });

  it("image-to-video needs a start image and accepts a last image", () => {
    expect(errorPaths(parseJobInput("kling_std_image", {}))).toContain("image_url");
    const r = parseJobInput("kling_std_image", { image_url: img, last_image_url: `${img}?end` });
    expect(r.ok && r.payload).toMatchObject({ image_url: img, last_image_url: `${img}?end` });
    expect(r.ok && r.payload).not.toHaveProperty("aspect_ratio");
  });
});

describe("MiniMax H3", () => {
  it("applies text-to-video defaults", () => {
    expect(parseJobInput("minimax_text", { prompt: "x" })).toEqual({
      ok: true,
      payload: { prompt: "x", duration: 5, aspect_ratio: "auto" },
    });
  });

  it("enforces 5-15s and its aspect ratios", () => {
    expect(errorPaths(parseJobInput("minimax_text", { prompt: "x", duration: 4 }))).toContain("duration");
    expect(parseJobInput("minimax_text", { prompt: "x", duration: 15, aspect_ratio: "adaptive" }).ok).toBe(true);
  });

  it("image-to-video needs a prompt and a first frame", () => {
    expect(errorPaths(parseJobInput("minimax_image", { image_url: img }))).toContain("prompt");
    expect(errorPaths(parseJobInput("minimax_image", { prompt: "x" }))).toContain("image_url");
    expect(parseJobInput("minimax_image", { prompt: "x", image_url: img, end_image_url: `${img}?end` }).ok).toBe(true);
  });

  it("reference-to-video needs an image or video and caps references at 12", () => {
    expect(parseJobInput("minimax_reference", { prompt: "x", audio_urls: [aud] }).ok).toBe(false);
    expect(parseJobInput("minimax_reference", { prompt: "x", video_urls: [vid], audio_urls: [aud] }).ok).toBe(true);
    expect(errorPaths(parseJobInput("minimax_reference", { prompt: "x", image_urls: many(img, 10) }))).toContain("image_urls");
    const tooMany = { prompt: "x", image_urls: many(img, 9), video_urls: many(vid, 3), audio_urls: [aud] };
    expect(parseJobInput("minimax_reference", tooMany).ok).toBe(false);
  });
});

describe("Genjutsu motion transfer", () => {
  it("needs a video and 1-8 images", () => {
    expect(errorPaths(parseJobInput("genjutsu", { image_urls: [img] }))).toContain("video_url");
    expect(errorPaths(parseJobInput("genjutsu", { video_url: vid }))).toContain("image_urls");
    expect(errorPaths(parseJobInput("genjutsu", { video_url: vid, image_urls: many(img, 9) }))).toContain("image_urls");
  });

  it("defaults to 720p and has no duration or audio", () => {
    expect(parseJobInput("genjutsu", { video_url: vid, image_urls: [img] })).toEqual({
      ok: true,
      payload: { video_url: vid, image_urls: [img], resolution: "720p" },
    });
  });

  it("object swap takes the same inputs", () => {
    expect(parseJobInput("genjutsu_swap", { video_url: vid, image_urls: [img], prompt: "swap the car", resolution: "480p" })).toEqual({
      ok: true,
      payload: { video_url: vid, image_urls: [img], prompt: "swap the car", resolution: "480p" },
    });
    expect(errorPaths(parseJobInput("genjutsu_swap", { video_url: vid }))).toContain("image_urls");
  });
});
