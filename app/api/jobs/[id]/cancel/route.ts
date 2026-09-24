import { NextResponse } from "next/server";
import { getDb, getJob, updateJob } from "@/lib/db";
import { describeError, getHiggsfield } from "@/lib/higgsfield";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const job = getJob(db, id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "queued" || !job.cancel_url) {
    return NextResponse.json({ error: "Only queued jobs can be canceled" }, { status: 409 });
  }
  try {
    const accepted = await getHiggsfield().cancel(job.cancel_url);
    if (!accepted) {
      return NextResponse.json({ error: "The job already started and can no longer be canceled" }, { status: 409 });
    }
    return NextResponse.json({ job: updateJob(db, id, { status: "canceled" }) });
  } catch (err) {
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
