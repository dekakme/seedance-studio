import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { findJobByClientToken, getDb, insertJob, listJobs, updateJob } from "@/lib/db";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { catalogIdOf, isCatalogMode } from "@/lib/catalog";
import { getCatalogEntry, validateCatalogInput } from "@/lib/catalog-server";
import { MODE_PATHS, isMode } from "@/lib/modes";
import { parseJobInput, type ParseResult } from "@/lib/schemas";
import type { JobMode } from "@/lib/types";

const CLIENT_TOKEN = /^[\w-]{8,64}$/;

export async function GET() {
  return NextResponse.json({ jobs: listJobs(getDb()) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mode?: unknown; input?: unknown; client_token?: unknown } | null;

  // curated modes have hand-written schemas; catalog modes use the model's published JSON schema
  let mode: JobMode;
  let path: string;
  let parsed: ParseResult;
  if (body && isMode(body.mode)) {
    mode = body.mode;
    path = MODE_PATHS[mode];
    parsed = parseJobInput(mode, body.input);
  } else if (body && isCatalogMode(body.mode) && getCatalogEntry(catalogIdOf(body.mode))) {
    const entry = getCatalogEntry(catalogIdOf(body.mode))!;
    mode = body.mode;
    path = `/${entry.id}`;
    parsed = validateCatalogInput(entry, body.input);
  } else {
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  }
  if (!parsed.ok) return NextResponse.json({ error: "Invalid input", errors: parsed.errors }, { status: 400 });

  const db = getDb();
  const clientToken = typeof body.client_token === "string" && CLIENT_TOKEN.test(body.client_token) ? body.client_token : null;
  // a retried or double-clicked submit returns the job it already created instead of paying twice
  if (clientToken) {
    const existing = findJobByClientToken(db, clientToken);
    if (existing) return NextResponse.json({ job: existing, duplicate: true });
  }

  let job;
  try {
    job = insertJob(db, { id: randomUUID(), mode, params: parsed.payload, status: "queued", client_token: clientToken });
  } catch (err) {
    const existing = clientToken ? findJobByClientToken(db, clientToken) : null;
    if (existing) return NextResponse.json({ job: existing, duplicate: true });
    throw err;
  }

  try {
    const r = await getHiggsfield().submitPath(path, parsed.payload);
    const updated = updateJob(db, job.id, {
      request_id: r.request_id,
      status_url: r.status_url,
      cancel_url: r.cancel_url,
      status: r.status,
    });
    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    const { httpStatus, message } = describeError(err);
    const failed = updateJob(db, job.id, { status: "error", error: message });
    return NextResponse.json({ error: message, job: failed }, { status: httpStatus });
  }
}
