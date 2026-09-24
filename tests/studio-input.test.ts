import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, buildInput } from "@/lib/studio-input";

describe("buildInput", () => {
  it("sends only the fields the mode supports", () => {
    const form = {
      ...DEFAULT_FORM,
      prompt: "  waves  ",
      media: { video_url: ["https://cdn.example.com/v.mp4"], image_url: ["https://cdn.example.com/i.png"] },
    };
    expect(buildInput("edit", form)).toEqual({
      prompt: "waves",
      video_url: "https://cdn.example.com/v.mp4",
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
    expect(buildInput("image", { ...DEFAULT_FORM, media: { image_url: ["https://cdn.example.com/i.png"] } })).not.toHaveProperty("prompt");
  });

  it("omits empty reference arrays", () => {
    const input = buildInput("reference", {
      ...DEFAULT_FORM,
      prompt: "x",
      media: { audio_urls: ["https://cdn.example.com/a.mp3"], image_urls: [] },
    });
    expect(input.audio_urls).toEqual(["https://cdn.example.com/a.mp3"]);
    expect(input).not.toHaveProperty("image_urls");
  });
});
