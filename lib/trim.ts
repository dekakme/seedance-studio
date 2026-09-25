import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

export const MIN_TRIM_SECONDS = 1;
const MAX_TIMESTAMP_SECONDS = 24 * 3600;

export interface TrimRange {
  start: number;
  end: number;
}

/** Validates the trim_start / trim_end form fields; null means "upload the whole file". */
export function parseTrimRange(startRaw: unknown, endRaw: unknown): TrimRange | null | "invalid" {
  if (startRaw == null && endRaw == null) return null;
  if (startRaw == null || endRaw == null) return "invalid";
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start < 0 || end > MAX_TIMESTAMP_SECONDS || end - start < MIN_TRIM_SECONDS) return "invalid";
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { start: round(start), end: round(end) };
}

/**
 * Cuts [start, end) out of `input` into an H.264/AAC mp4. Re-encodes so the cut is frame-accurate
 * instead of snapping to the nearest keyframe.
 */
export async function trimVideo(input: string, output: string, range: TrimRange): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static)");
  await run(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(range.start),
      "-i", input,
      "-t", String(range.end - range.start),
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-y",
      output,
    ],
    { timeout: 5 * 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
}
