import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDb, getJob } from "@/lib/db";
import { parseRange } from "@/lib/range";
import { VIDEO_DIR } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(getDb(), id);
  if (!job?.local_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = path.join(VIDEO_DIR, path.basename(job.local_path));
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.endsWith(".mov") ? "video/quicktime" : "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  }
  if (range) {
    const stream = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(stat.size) } });
}
