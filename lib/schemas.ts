import { z } from "zod";
import {
  ASPECT_RATIOS,
  BITRATE_MODES,
  DURATION,
  MODES,
  MODE_SPECS,
  OUTPUT_FORMATS,
  RESOLUTIONS,
  type Mode,
} from "./modes";

export type ParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: { path: string; message: string }[] };

const httpsUrl = z.url({ protocol: /^https$/, message: "Must be an https URL" });

function buildSchema(mode: Mode) {
  const spec = MODE_SPECS[mode];
  const shape: Record<string, z.ZodType> = {
    prompt: spec.promptRequired ? z.string().trim().min(1, "Prompt is required") : z.string().trim().optional(),
    resolution: z.enum(RESOLUTIONS).default("720p"),
    bitrate_mode: z.enum(BITRATE_MODES).default("high"),
    generate_audio: z.boolean().default(true),
  };
  if (spec.duration) {
    shape.duration = z.number().int().min(DURATION.min).max(DURATION.max).default(DURATION.default);
  }
  if (spec.aspectRatio) shape.aspect_ratio = z.enum(ASPECT_RATIOS).default("16:9");
  if (spec.outputFormat) shape.output_format = z.enum(OUTPUT_FORMATS).default("mp4");
  for (const { field, required } of spec.single) {
    shape[field] = required ? httpsUrl : httpsUrl.optional();
  }
  for (const [field, max] of Object.entries(spec.multi)) {
    shape[field] = z.array(httpsUrl).max(max, `At most ${max} items`).default([]);
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
