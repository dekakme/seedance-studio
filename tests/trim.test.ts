import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTrimRange, trimVideo } from "@/lib/trim";

const run = promisify(execFile);

/** Reads "Duration: 00:00:02.50" from ffmpeg's stderr (ffmpeg exits non-zero without an output file). */
async function durationOf(file: string): Promise<number> {
  const stderr = await run(ffmpegPath!, ["-hide_banner", "-i", file]).then(
    (r) => r.stderr,
    (err: { stderr: string }) => err.stderr,
  );
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  if (!m) throw new Error(`no duration in: ${stderr}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

describe("parseTrimRange", () => {
  it("returns null when no trim was requested", () => {
    expect(parseTrimRange(null, null)).toBeNull();
  });

  it("parses a valid range", () => {
    expect(parseTrimRange("1.5", "4.25")).toEqual({ start: 1.5, end: 4.25 });
  });

  it("rejects ranges that are negative, reversed, too short or not numbers", () => {
    expect(parseTrimRange("-1", "3")).toBe("invalid");
    expect(parseTrimRange("4", "2")).toBe("invalid");
    expect(parseTrimRange("1", "1.5")).toBe("invalid");
    expect(parseTrimRange("abc", "3")).toBe("invalid");
    expect(parseTrimRange("1", null)).toBe("invalid");
  });
});

describe("trimVideo", () => {
  let dir: string;
  let source: string;

  beforeAll(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "seedance-trim-test-"));
    source = path.join(dir, "source.mp4");
    await run(ffmpegPath!, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=24",
      "-f", "lavfi", "-i", "sine=duration=6",
      "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", source,
    ]);
  }, 60_000);

  afterAll(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("cuts the requested range", async () => {
    const out = path.join(dir, "out.mp4");
    await trimVideo(source, out, { start: 1.5, end: 4 });
    expect(await durationOf(out)).toBeCloseTo(2.5, 0);
  }, 60_000);
});
