import { NextResponse } from "next/server";
import { refreshJob } from "@/lib/jobs";
import { refreshDeps } from "@/lib/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await refreshJob(refreshDeps(), id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}
