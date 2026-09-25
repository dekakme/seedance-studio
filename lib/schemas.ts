import { z } from "zod";
import { BITRATE_MODES, MODES, MODE_SPECS, OUTPUT_FORMATS, RESOLUTIONS, type Mode } from "./modes";

export type ParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: { path: string; message: string }[] };

const httpsUrl = z.url({ protocol: /^https$/, message: "Must be an https URL" });

function buildSchema(mode: Mode) {
  const spec = MODE_SPECS[mode];
  let prompt = z.string({ error: "Prompt is required" }).trim();
  if (spec.promptMax) prompt = prompt.max(spec.promptMax);
  const shape: Record<string, z.ZodType> = {
    prompt: spec.promptRequired ? prompt.min(1, "Prompt is required") : prompt.optional(),
  };
  if (spec.resolution) shape.resolution = z.enum(RESOLUTIONS).default("720p");
  if (spec.bitrate) shape.bitrate_mode = z.enum(BITRATE_MODES).default("high");
  if (spec.audio === "generate_audio") shape.generate_audio = z.boolean().default(true);
  if (spec.audio === "sound") shape.sound = z.enum(["on", "off"]).default("on");
  if (spec.cfgScale) shape.cfg_scale = z.number().min(0).max(1).default(0.5);
  if (spec.duration) {
    shape.duration = z.number().int().min(spec.duration.min).max(spec.duration.max).default(spec.duration.default);
  }
  if (spec.aspectRatios) shape.aspect_ratio = z.enum(spec.aspectRatios).default(spec.aspectRatios[0]);
  if (spec.outputFormat) shape.output_format = z.enum(OUTPUT_FORMATS).default("mp4");
  for (const { field, required } of spec.single) {
    shape[field] = required ? httpsUrl : httpsUrl.optional();
  }
  for (const [field, limits] of Object.entries(spec.multi)) {
    const list = z.array(httpsUrl).max(limits.max, `At most ${limits.max} items`);
    shape[field] = limits.min ? list.min(limits.min, `Add at least ${limits.min}`) : list.default([]);
  }

  const schema = z.strictObject(shape);
  if (mode !== "reference") return schema;
  return schema.refine(
    (v) => ["image_urls", "video_urls", "audio_urls"].some((k) => (v[k] as unknown[]).length > 0),
    { message: "Add at least one reference image, video or audio" },
  );
}

const SCHEMAS = {} as Record<Mode, z.ZodType>;
for (const m of MODES) SCHEMAS[m] = buildSchema(m);

/** Drops unset values, empty strings and empty arrays so Higgsfield only sees real inputs. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

export function parseJobInput(mode: Mode, input: unknown): ParseResult {
  const result = SCHEMAS[mode].safeParse(input ?? {});
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  return { ok: true, payload: compact(result.data as Record<string, unknown>) };
}
