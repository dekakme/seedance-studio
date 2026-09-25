import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { MAX_UPLOAD_BYTES, isAllowedUploadType } from "@/lib/modes";
import { parseTrimRange, trimVideo, type TrimRange } from "@/lib/trim";

/** Cuts the video on disk with ffmpeg, then uploads the trimmed mp4. */
async function uploadTrimmed(file: File, range: TrimRange): Promise<string> {
  // temp paths are runtime-only, keep them out of Turbopack's file tracing
  const dir = await fs.promises.mkdtemp(path.join(/* turbopackIgnore: true */ os.tmpdir(), "seedance-trim-"));
  try {
    const input = path.join(/* turbopackIgnore: true */ dir, `${randomUUID()}${path.extname(file.name) || ".mp4"}`);
    const output = path.join(/* turbopackIgnore: true */ dir, "trimmed.mp4");
    await pipeline(Readable.fromWeb(file.stream() as NodeReadableStream), fs.createWriteStream(input));
    await trimVideo(input, output, range);
    return await getHiggsfield().uploadFile(await fs.openAsBlob(output, { type: "video/mp4" }), "video/mp4");
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

export async function POST(request: NextRequest) {
  // excluded from proxy.ts so large videos are streamed, not buffered — so authenticate here
  if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Could not read the uploaded file" }, { status: 400 });
  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 413 });
  }
  const range = parseTrimRange(form!.get("trim_start"), form!.get("trim_end"));
  if (range === "invalid") return NextResponse.json({ error: "Invalid trim range" }, { status: 400 });
  if (range && !file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Only videos can be trimmed" }, { status: 400 });
  }
  try {
    const url = range ? await uploadTrimmed(file, range) : await getHiggsfield().uploadFile(file, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    console.warn(`[uploads] ${file.name} (${file.type}, ${file.size} bytes) failed:`, err);
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
