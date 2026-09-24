import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export const VIDEO_DIR = path.join(process.cwd(), "storage", "videos");

const SAFE_NAME = /^[\w-]+\.(mp4|mov)$/;

/** Streams a remote video to <dir>/<fileName> atomically and returns fileName. */
export async function downloadVideo(
  url: string,
  fileName: string,
  opts: { dir?: string; fetch?: typeof fetch } = {},
): Promise<string> {
  if (!SAFE_NAME.test(fileName)) throw new Error(`Invalid video file name: ${fileName}`);
  const dir = opts.dir ?? VIDEO_DIR;
  const doFetch = opts.fetch ?? fetch;
  await fs.promises.mkdir(dir, { recursive: true });

  const res = await doFetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);

  const finalPath = path.join(dir, fileName);
  const tmpPath = `${finalPath}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as NodeReadableStream), fs.createWriteStream(tmpPath));
    await fs.promises.rename(tmpPath, finalPath);
  } catch (err) {
    await fs.promises.rm(tmpPath, { force: true });
    throw err;
  }
  return fileName;
}
