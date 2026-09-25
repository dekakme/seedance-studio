import { DURATION, MODE_SPECS, type MediaKind, type Mode, type MultiField, type SingleField } from "./modes";
import type { RefItem } from "./tags";
import type { Job } from "./types";

export type Tab = "create" | "edit";
export type CreateSub = "references" | "frames" | "extend" | "motion" | "swap";
/** Models offered on the Create Video tab (Edit Video is Seedance edit). */
export type CreateModel = "seedance" | "kling" | "genjutsu" | "minimax";
export type KlingTier = "std" | "pro" | "4k";

export interface FormState {
  prompt: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  bitrate_mode: string;
  output_format: string;
  /** Seedance generate_audio / Kling sound */
  generate_audio: boolean;
  cfg_scale: number;
  /** start frame, end frame or source video */
  media: Partial<Record<SingleField, string>>;
  /** ordered reference media; tags (@Image1, @Video1…) are numbered per kind in this order */
  refs: RefItem[];
}

export interface ComposerPreset {
  tab: Tab;
  sub: CreateSub;
  model: CreateModel;
  tier: KlingTier;
  form: FormState;
}

export const DEFAULT_FORM: FormState = {
  prompt: "",
  duration: DURATION.default,
  resolution: "720p",
  aspect_ratio: "16:9",
  bitrate_mode: "high",
  output_format: "mp4",
  generate_audio: true,
  cfg_scale: 0.5,
  media: {},
  refs: [],
};

export const KIND_FIELD: Record<MediaKind, MultiField> = {
  image: "image_urls",
  video: "video_urls",
  audio: "audio_urls",
};

/** Maps the composer tabs to an endpoint; Seedance References without media is plain text-to-video. */
export function resolveMode(tab: Tab, sub: CreateSub, refs: RefItem[], model: CreateModel = "seedance", tier: KlingTier = "std"): Mode {
  if (tab === "edit") return "edit";
  if (model === "genjutsu") return sub === "swap" ? "genjutsu_swap" : "genjutsu";
  if (model === "minimax") return sub === "frames" ? "minimax_image" : refs.length > 0 ? "minimax_reference" : "minimax_text";
  if (model === "kling") return sub === "frames" ? `kling_${tier}_image` : `kling_${tier}_text`;
  if (sub === "frames") return "image";
  if (sub === "extend") return "extend";
  return refs.length > 0 ? "reference" : "text";
}

// text modes take their reference mode's limits, since adding a reference switches to it
const REFERENCE_MODE_FOR: Partial<Record<Mode, Mode>> = { text: "reference", minimax_text: "minimax_reference" };

/** Max references per kind for a mode. */
export function refLimits(mode: Mode): Partial<Record<MediaKind, number>> {
  const multi = MODE_SPECS[REFERENCE_MODE_FOR[mode] ?? mode].multi;
  const limits: Partial<Record<MediaKind, number>> = {};
  for (const kind of Object.keys(KIND_FIELD) as MediaKind[]) {
    const entry = multi[KIND_FIELD[kind]];
    if (entry) limits[kind] = entry.max;
  }
  return limits;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function buildInput(mode: Mode, form: FormState): Record<string, unknown> {
  const spec = MODE_SPECS[mode];
  const input: Record<string, unknown> = {};
  const prompt = form.prompt.trim();
  if (prompt) input.prompt = prompt;
  if (spec.resolution) input.resolution = form.resolution;
  if (spec.bitrate) input.bitrate_mode = form.bitrate_mode;
  if (spec.audio === "generate_audio") input.generate_audio = form.generate_audio;
  if (spec.audio === "sound") input.sound = form.generate_audio ? "on" : "off";
  if (spec.cfgScale) input.cfg_scale = form.cfg_scale;
  if (spec.duration) input.duration = clamp(form.duration, spec.duration.min, spec.duration.max);
  if (spec.aspectRatios) {
    input.aspect_ratio = spec.aspectRatios.includes(form.aspect_ratio) ? form.aspect_ratio : spec.aspectRatios[0];
  }
  if (spec.outputFormat) input.output_format = form.output_format;
  for (const { field } of spec.single) {
    const url = form.media[field];
    if (url) input[field] = url;
  }
  for (const kind of Object.keys(KIND_FIELD) as MediaKind[]) {
    const field = KIND_FIELD[kind];
    if (!(field in spec.multi)) continue;
    const urls = form.refs.filter((r) => r.kind === kind).map((r) => r.url);
    if (urls.length > 0) input[field] = urls;
  }
  return input;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Rebuilds composer state from a stored job, for "Reuse". */
export function formFromJob(job: Pick<Job, "mode" | "params">): ComposerPreset {
  const p = job.params;
  const spec = MODE_SPECS[job.mode];
  const media: FormState["media"] = {};
  for (const field of ["image_url", "end_image_url", "last_image_url", "video_url"] as const) {
    const url = str(p[field]);
    if (url) media[field] = url;
  }
  const refs: RefItem[] = (Object.keys(KIND_FIELD) as MediaKind[]).flatMap((kind) =>
    strs(p[KIND_FIELD[kind]]).map((url) => ({ kind, url })),
  );
  const fromImage = job.mode === "image" || job.mode.endsWith("_image");
  const sub: CreateSub =
    job.mode === "genjutsu_swap"
      ? "swap"
      : job.mode === "genjutsu"
        ? "motion"
        : fromImage
          ? "frames"
          : job.mode === "extend"
            ? "extend"
            : "references";
  return {
    tab: job.mode === "edit" ? "edit" : "create",
    sub,
    model: spec.model,
    tier: job.mode.startsWith("kling_pro") ? "pro" : job.mode.startsWith("kling_4k") ? "4k" : "std",
    form: {
      prompt: str(p.prompt) ?? "",
      duration: typeof p.duration === "number" ? p.duration : DEFAULT_FORM.duration,
      resolution: str(p.resolution) ?? DEFAULT_FORM.resolution,
      aspect_ratio: str(p.aspect_ratio) ?? DEFAULT_FORM.aspect_ratio,
      bitrate_mode: str(p.bitrate_mode) ?? DEFAULT_FORM.bitrate_mode,
      output_format: str(p.output_format) ?? DEFAULT_FORM.output_format,
      generate_audio: p.generate_audio === false || p.sound === "off" ? false : true,
      cfg_scale: typeof p.cfg_scale === "number" ? p.cfg_scale : DEFAULT_FORM.cfg_scale,
      media,
      refs,
    },
  };
}
