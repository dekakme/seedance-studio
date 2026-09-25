import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { deleteJob, getDb, getJob } from "@/lib/db";
import { refreshJob } from "@/lib/jobs";
import { refreshDeps } from "@/lib/server";
import { VIDEO_DIR } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await refreshJob(refreshDeps(), id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

/** Removes the job from the history and its downloaded video. A running generation keeps running on Higgsfield. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const job = getJob(db, id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteJob(db, id);
  if (job.local_path) await fs.promises.rm(path.join(VIDEO_DIR, path.basename(job.local_path)), { force: true });
  return NextResponse.json({ ok: true });
}
