import { DURATION, MODE_SPECS, type MediaKind, type Mode, type MultiField, type SingleField } from "./modes";
import type { RefItem } from "./tags";
import type { Job } from "./types";

export type Tab = "create" | "edit";
export type CreateSub = "references" | "frames" | "extend";

export interface FormState {
  prompt: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  bitrate_mode: string;
  output_format: string;
  generate_audio: boolean;
  /** start frame, end frame or source video */
  media: Partial<Record<SingleField, string>>;
  /** ordered reference media; tags (@Image1, @Video1…) are numbered per kind in this order */
  refs: RefItem[];
}

export const DEFAULT_FORM: FormState = {
  prompt: "",
  duration: DURATION.default,
  resolution: "720p",
  aspect_ratio: "16:9",
  bitrate_mode: "high",
  output_format: "mp4",
  generate_audio: true,
  media: {},
  refs: [],
};

export const KIND_FIELD: Record<MediaKind, MultiField> = {
  image: "image_urls",
  video: "video_urls",
  audio: "audio_urls",
};

/** Maps the composer tabs to a Seedance endpoint; References without media is plain text-to-video. */
export function resolveMode(tab: Tab, sub: CreateSub, refs: RefItem[]): Mode {
  if (tab === "edit") return "edit";
  if (sub === "frames") return "image";
  if (sub === "extend") return "extend";
  return refs.length > 0 ? "reference" : "text";
}

/** Max references per kind for a mode (text mode takes the reference limits, since adding one switches to it). */
export function refLimits(mode: Mode): Partial<Record<MediaKind, number>> {
  const multi = MODE_SPECS[mode === "text" ? "reference" : mode].multi;
  const limits: Partial<Record<MediaKind, number>> = {};
  for (const kind of Object.keys(KIND_FIELD) as MediaKind[]) {
    const max = multi[KIND_FIELD[kind]];
    if (max) limits[kind] = max;
  }
  return limits;
}

export function buildInput(mode: Mode, form: FormState): Record<string, unknown> {
  const spec = MODE_SPECS[mode];
  const input: Record<string, unknown> = {
    resolution: form.resolution,
    bitrate_mode: form.bitrate_mode,
    generate_audio: form.generate_audio,
  };
  const prompt = form.prompt.trim();
  if (prompt) input.prompt = prompt;
  if (spec.duration) input.duration = form.duration;
  if (spec.aspectRatio) input.aspect_ratio = form.aspect_ratio;
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
export function formFromJob(job: Pick<Job, "mode" | "params">): { tab: Tab; sub: CreateSub; form: FormState } {
  const p = job.params;
  const media: FormState["media"] = {};
  for (const field of ["image_url", "end_image_url", "video_url"] as const) {
    const url = str(p[field]);
    if (url) media[field] = url;
  }
  const refs: RefItem[] = (Object.keys(KIND_FIELD) as MediaKind[]).flatMap((kind) =>
    strs(p[KIND_FIELD[kind]]).map((url) => ({ kind, url })),
  );
  return {
    tab: job.mode === "edit" ? "edit" : "create",
    sub: job.mode === "image" ? "frames" : job.mode === "extend" ? "extend" : "references",
    form: {
      prompt: str(p.prompt) ?? "",
      duration: typeof p.duration === "number" ? p.duration : DEFAULT_FORM.duration,
      resolution: str(p.resolution) ?? DEFAULT_FORM.resolution,
      aspect_ratio: str(p.aspect_ratio) ?? DEFAULT_FORM.aspect_ratio,
      bitrate_mode: str(p.bitrate_mode) ?? DEFAULT_FORM.bitrate_mode,
      output_format: str(p.output_format) ?? DEFAULT_FORM.output_format,
      generate_audio: typeof p.generate_audio === "boolean" ? p.generate_audio : true,
      media,
      refs,
    },
  };
}
