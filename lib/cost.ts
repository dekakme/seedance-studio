// Seedance 2.5 pricing from the Higgsfield model docs:
// tokens = ceil((input video s + generated video s) × width × height × 24 fps / 1024),
// $0.0214 per 1,000 tokens at 480p or 720p (before any customer discount).
import { MODE_SPECS, type Mode } from "./modes";
import type { FormState } from "./studio-input";
import type { Job } from "./types";

export const USD_PER_1K_TOKENS = 0.0214;
const FPS = 24;
/** Higgsfield trims video inputs to a 30-second budget. */
const MAX_INPUT_VIDEO_SECONDS = 30;
const SHORT_SIDE: Record<string, number> = { "480p": 480, "720p": 720 };

export function outputDims(resolution: string, aspectRatio: string): { width: number; height: number } {
  const short = SHORT_SIDE[resolution] ?? 720;
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return { width: Math.round((short * 16) / 9), height: short };
  return w >= h ? { width: Math.round((short * w) / h), height: short } : { width: short, height: Math.round((short * h) / w) };
}

export function estimateCost(opts: {
  resolution: string;
  aspectRatio: string;
  outputSeconds: number;
  inputVideoSeconds?: number;
}): { tokens: number; usd: number } {
  const { width, height } = outputDims(opts.resolution, opts.aspectRatio);
  const seconds = (opts.inputVideoSeconds ?? 0) + opts.outputSeconds;
  const tokens = Math.ceil((seconds * width * height * FPS) / 1024);
  return { tokens, usd: Math.round((tokens / 1000) * USD_PER_1K_TOKENS * 10_000) / 10_000 };
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export interface FormEstimate {
  tokens: number;
  usd: number;
  notes: string[];
}

/**
 * Live estimate for the Studio form. `durations` maps uploaded video URLs to their length in seconds.
 * Returns null when the output length is still unknown (edit mode before the source video loads).
 */
export function estimateForForm(mode: Mode, form: FormState, durations: Record<string, number>): FormEstimate | null {
  const spec = MODE_SPECS[mode];
  const notes: string[] = [];

  const source = spec.single.some((s) => s.field === "video_url") ? form.media.video_url : undefined;
  const refVideos = "video_urls" in spec.multi ? form.refs.filter((r) => r.kind === "video").map((r) => r.url) : [];
  const videoUrls = [...(source ? [source] : []), ...refVideos];
  let knownSeconds = 0;
  let unknown = false;
  for (const url of videoUrls) {
    const d = durations[url];
    if (d && Number.isFinite(d)) knownSeconds += d;
    else unknown = true;
  }
  if (unknown) notes.push("Some video lengths are still loading, so the estimate may be low.");

  let outputSeconds: number;
  if (spec.duration) {
    outputSeconds = form.duration;
  } else {
    const d = source ? durations[source] : undefined;
    if (!d) return null;
    outputSeconds = Math.min(MAX_INPUT_VIDEO_SECONDS, Math.max(4, d));
    notes.push("Edit output length follows the source video.");
  }
  if (!spec.aspectRatio) notes.push("Assumes 16:9 framing; the real frame follows your source media.");

  const { tokens, usd } = estimateCost({
    resolution: form.resolution,
    aspectRatio: spec.aspectRatio ? form.aspect_ratio : "16:9",
    outputSeconds,
    inputVideoSeconds: Math.min(MAX_INPUT_VIDEO_SECONDS, knownSeconds),
  });
  return { tokens, usd, notes };
}

/**
 * Estimate for a stored job from the payload sent to Higgsfield. Input video length is not stored,
 * so jobs with input videos are marked `partial` (generated seconds only). Edit jobs have no duration.
 */
export function estimateJobCost(job: Pick<Job, "mode" | "params">): { usd: number; partial: boolean } | null {
  const p = job.params;
  if (typeof p.duration !== "number") return null;
  const hasInputVideo = typeof p.video_url === "string" || (Array.isArray(p.video_urls) && p.video_urls.length > 0);
  const { usd } = estimateCost({
    resolution: typeof p.resolution === "string" ? p.resolution : "720p",
    aspectRatio: typeof p.aspect_ratio === "string" ? p.aspect_ratio : "16:9",
    outputSeconds: p.duration,
  });
  return { usd, partial: hasInputVideo };
}
