import { describe, expect, it } from "vitest";
import { buildCatalogInput, catalogRefLimits, describeFields, initialValues, isCatalogMode } from "@/lib/catalog";
import { getCatalogEntry, validateCatalogInput } from "@/lib/catalog-server";

const img = "https://cdn.example.com/a.png";
const vid = "https://cdn.example.com/v.mp4";

const schema = {
  type: "object",
  required: ["prompt", "image_url"],
  properties: {
    prompt: { type: "string", minLength: 1 },
    negative_prompt: { type: "string" },
    image_url: { type: "string", format: "uri" },
    last_frame_url: { type: "string", format: "uri" },
    video_urls: { type: "array", items: { type: "string", format: "uri" }, maxItems: 3 },
    file_url: { type: "string", format: "uri", title: "Reference Document" },
    duration: { type: "integer", minimum: 3, maximum: 15, default: 5 },
    resolution: { enum: ["480p", "720p"], default: "720p" },
    seed: { type: "integer" },
    cfg_scale: { type: "number", minimum: 0, maximum: 1, multipleOf: 0.01, default: 0.5 },
    generate_audio: { type: "boolean", default: true },
    multi_shots: { type: "boolean", default: false },
    multi_prompt: { type: "array", items: { type: "object" } },
  },
};

describe("describeFields", () => {
  const fields = describeFields(schema);
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

  it("classifies every supported field type", () => {
    expect(byName.prompt).toMatchObject({ kind: "prompt", required: true });
    expect(byName.negative_prompt.kind).toBe("text");
    expect(byName.image_url).toMatchObject({ kind: "media", mediaKind: "image", required: true });
    expect(byName.last_frame_url).toMatchObject({ kind: "media", mediaKind: "image" });
    expect(byName.video_urls).toMatchObject({ kind: "mediaList", mediaKind: "video", max: 3 });
    expect(byName.file_url.kind).toBe("url");
    expect(byName.duration).toMatchObject({ kind: "duration", min: 3, max: 15, default: 5 });
    expect(byName.resolution).toMatchObject({ kind: "enum", options: ["480p", "720p"] });
    expect(byName.seed.kind).toBe("number");
    expect(byName.cfg_scale).toMatchObject({ kind: "number", step: 0.01 });
    expect(byName.generate_audio.kind).toBe("boolean");
  });

  it("skips multi-shot controls the generic form cannot drive", () => {
    expect(byName.multi_shots).toBeUndefined();
    expect(byName.multi_prompt).toBeUndefined();
  });

  it("derives reference limits from list fields", () => {
    expect(catalogRefLimits(fields)).toEqual({ video: 3 });
  });
});

describe("buildCatalogInput", () => {
  const fields = describeFields(schema);

  it("starts from schema defaults", () => {
    expect(initialValues(fields)).toEqual({ duration: 5, resolution: "720p", cfg_scale: 0.5, generate_audio: true });
  });

  it("sends set values and splits references into their list field", () => {
    const values = { ...initialValues(fields), prompt: "  go  ", negative_prompt: "", image_url: img };
    const refs = [
      { kind: "video" as const, url: vid },
      { kind: "image" as const, url: img },
    ];
    expect(buildCatalogInput(fields, values, refs)).toEqual({
      prompt: "go",
      image_url: img,
      video_urls: [vid],
      duration: 5,
      resolution: "720p",
      cfg_scale: 0.5,
      generate_audio: true,
    });
  });
});

describe("isCatalogMode", () => {
  it("recognises catalog modes", () => {
    expect(isCatalogMode("catalog:alibaba/wan-3.0/text-to-video")).toBe(true);
    expect(isCatalogMode("text")).toBe(false);
    expect(isCatalogMode("catalog:")).toBe(false);
  });
});

describe("validateCatalogInput (real catalog)", () => {
  const motion = getCatalogEntry("kling-video/v3/motion-control/std")!;

  it("knows every synced model", () => {
    expect(getCatalogEntry("alibaba/wan-3.0/text-to-video")).toBeDefined();
    expect(getCatalogEntry("../../evil")).toBeUndefined();
  });

  it("reports missing required fields by name", () => {
    const r = validateCatalogInput(motion, {});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(motion.schema.required as string[]));
  });

  it("rejects non-https media and unknown fields", () => {
    const wan = getCatalogEntry("alibaba/wan-3.0/text-to-video")!;
    expect(validateCatalogInput(wan, { prompt: "x", not_a_field: 1 }).ok).toBe(false);
    const i2v = getCatalogEntry("alibaba/wan-3.0/image-to-video")!;
    const field = describeFields(i2v.schema).find((f) => f.kind === "media")!.name;
    const r = validateCatalogInput(i2v, { prompt: "x", [field]: "http://cdn.example.com/a.png" });
    expect(!r.ok && r.errors.some((e) => e.path === field)).toBe(true);
  });

  it("accepts a valid payload", () => {
    const wan = getCatalogEntry("alibaba/wan-3.0/text-to-video")!;
    expect(validateCatalogInput(wan, { prompt: "a cat" })).toMatchObject({ ok: true });
  });
});
