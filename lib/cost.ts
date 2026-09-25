// Pricing from the Higgsfield model docs (before any customer discount):
// - Seedance 2.5: tokens = ceil((input video s + generated video s) × width × height × 24 fps / 1024),
//   $0.0214 per 1,000 tokens at 480p or 720p.
// - Genjutsu (Motion Transfer, Object Swap): per started second of input video. The console currently shows
//   50% off: $0.159 at 480p; 720p assumed at the same discount, $0.3405 (list $0.318 / $0.681).
// - Kling 3.0: per second of output, from the Higgsfield console price list (not in the API docs);
//   these are the promotional (45% off) rates: std $0.0462, pro $0.0616, 4K $0.231 (list $0.084 / $0.112 / $0.42).
import { MODE_SPECS, type Mode } from "./modes";
import type { FormState } from "./studio-input";
import type { Job } from "./types";

export const USD_PER_1K_TOKENS = 0.0214;
export const GENJUTSU_USD_PER_SECOND: Record<string, number> = { "480p": 0.159, "720p": 0.3405 };
export const KLING_USD_PER_SECOND: Record<string, number> = { std: 0.0462, pro: 0.0616, "4k": 0.231 };
// MiniMax H3 (reference-to-video docs; applied to all H3 modes): $0.13 per generated 2K second,
// first 5 reference images included, $0.08 per extra image
export const MINIMAX_USD_PER_SECOND = 0.13;
const MINIMAX_FREE_IMAGES = 5;
const MINIMAX_USD_PER_EXTRA_IMAGE = 0.08;

function klingRate(mode: Mode): number {
  const tier = mode.split("_")[1];
  return KLING_USD_PER_SECOND[tier] ?? KLING_USD_PER_SECOND.std;
}

/** The duration actually sent: clamped to the mode's range, like buildInput does. */
function sentSeconds(mode: Mode, duration: number): number {
  const range = MODE_SPECS[mode].duration!;
  return Math.min(range.max, Math.max(range.min, duration));
}

function minimaxUsd(seconds: number, images: number): number {
  return round4(seconds * MINIMAX_USD_PER_SECOND + Math.max(0, images - MINIMAX_FREE_IMAGES) * MINIMAX_USD_PER_EXTRA_IMAGE);
}
const FPS = 24;
/** Seedance trims video inputs to a 30-second budget. */
const MAX_INPUT_VIDEO_SECONDS = 30;
const SHORT_SIDE: Record<string, number> = { "480p": 480, "720p": 720 };

export function outputDims(resolution: string, aspectRatio: string): { width: number; height: number } {
  const short = SHORT_SIDE[resolution] ?? 720;
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return { width: Math.round((short * 16) / 9), height: short };
  return w >= h ? { width: Math.round((short * w) / h), height: short } : { width: short, height: Math.round((short * h) / w) };
}

const round4 = (usd: number) => Math.round(usd * 10_000) / 10_000;

export function estimateCost(opts: {
  resolution: string;
  aspectRatio: string;
  outputSeconds: number;
  inputVideoSeconds?: number;
}): { tokens: number; usd: number } {
  const { width, height } = outputDims(opts.resolution, opts.aspectRatio);
  const seconds = (opts.inputVideoSeconds ?? 0) + opts.outputSeconds;
  const tokens = Math.ceil((seconds * width * height * FPS) / 1024);
  return { tokens, usd: round4((tokens / 1000) * USD_PER_1K_TOKENS) };
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export interface FormEstimate {
  usd: number;
  /** how the number was computed, shown under the Generate button */
  detail: string;
  notes: string[];
}

/**
 * Live estimate for the composer. `durations` maps uploaded video URLs to their length in seconds.
 * Returns null when a needed video length is still unknown.
 */
export function estimateForForm(mode: Mode, form: FormState, durations: Record<string, number>): FormEstimate | null {
  const spec = MODE_SPECS[mode];
  if (spec.model === "minimax") {
    const seconds = sentSeconds(mode, form.duration);
    const images = "image_urls" in spec.multi ? form.refs.filter((r) => r.kind === "image").length : 0;
    const extra = Math.max(0, images - MINIMAX_FREE_IMAGES);
    return {
      usd: minimaxUsd(seconds, images),
      detail: `${seconds}s × $${MINIMAX_USD_PER_SECOND}/s${extra ? ` + ${extra} extra image${extra > 1 ? "s" : ""} × $${MINIMAX_USD_PER_EXTRA_IMAGE}` : ""}`,
      notes: images > 0 && images <= MINIMAX_FREE_IMAGES ? [`First ${MINIMAX_FREE_IMAGES} reference images are included.`] : [],
    };
  }
  if (spec.model === "kling") {
    const seconds = sentSeconds(mode, form.duration);
    const rate = klingRate(mode);
    return {
      usd: round4(seconds * rate),
      detail: `${seconds}s × $${rate}/s`,
      notes: ["Kling rates are Higgsfield's current promo prices and may change."],
    };
  }

  const source = spec.single.some((s) => s.field === "video_url") ? form.media.video_url : undefined;
  if (spec.model === "genjutsu") {
    const d = source ? durations[source] : undefined;
    if (!d) return null;
    const seconds = Math.ceil(d);
    const rate = GENJUTSU_USD_PER_SECOND[form.resolution] ?? GENJUTSU_USD_PER_SECOND["720p"];
    return {
      usd: round4(seconds * rate),
      detail: `${seconds}s of input video × $${rate}/s`,
      notes: ["Genjutsu rates are Higgsfield's current promo prices and may change."],
    };
  }

  const notes: string[] = [];
  const refVideos = "video_urls" in spec.multi ? form.refs.filter((r) => r.kind === "video").map((r) => r.url) : [];
  let knownSeconds = 0;
  let unknown = false;
  for (const url of [...(source ? [source] : []), ...refVideos]) {
    const d = durations[url];
    if (d && Number.isFinite(d)) knownSeconds += d;
    else unknown = true;
  }
  if (unknown) notes.push("Some video lengths are still loading, so the estimate may be low.");

  let outputSeconds: number;
  if (spec.duration) {
    outputSeconds = Math.min(spec.duration.max, Math.max(spec.duration.min, form.duration));
  } else {
    const d = source ? durations[source] : undefined;
    if (!d) return null;
    outputSeconds = Math.min(MAX_INPUT_VIDEO_SECONDS, Math.max(4, d));
    notes.push("Edit output length follows the source video.");
  }
  if (!spec.aspectRatios) notes.push("Assumes 16:9 framing; the real frame follows your source media.");

  const { tokens, usd } = estimateCost({
    resolution: form.resolution,
    aspectRatio: spec.aspectRatios?.includes(form.aspect_ratio) ? form.aspect_ratio : "16:9",
    outputSeconds,
    inputVideoSeconds: Math.min(MAX_INPUT_VIDEO_SECONDS, knownSeconds),
  });
  return { usd, detail: `${tokens.toLocaleString("en-US")} video tokens × $0.0214 / 1K`, notes };
}

/**
 * Estimate for a stored Seedance job from the payload sent to Higgsfield. Input video length is not
 * stored, so jobs with input videos are marked `partial` (generated seconds only). Kling is priced per
 * output second. Edit and Genjutsu jobs return null (they are priced by input video length).
 */
export function estimateJobCost(job: Pick<Job, "mode" | "params">): { usd: number; partial: boolean } | null {
  const model = MODE_SPECS[job.mode].model;
  const p = job.params;
  if (model === "genjutsu" || typeof p.duration !== "number") return null;
  if (model === "kling") return { usd: round4(sentSeconds(job.mode, p.duration) * klingRate(job.mode)), partial: false };
  if (model === "minimax") {
    const images = Array.isArray(p.image_urls) ? p.image_urls.length : 0;
    return { usd: minimaxUsd(sentSeconds(job.mode, p.duration), images), partial: false };
  }
  const hasInputVideo = typeof p.video_url === "string" || (Array.isArray(p.video_urls) && p.video_urls.length > 0);
  const { usd } = estimateCost({
    resolution: typeof p.resolution === "string" ? p.resolution : "720p",
    aspectRatio: typeof p.aspect_ratio === "string" ? p.aspect_ratio : "16:9",
    outputSeconds: p.duration,
  });
  return { usd, partial: hasInputVideo };
}
