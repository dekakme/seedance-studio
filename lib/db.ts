import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Mode } from "./modes";
import type { Job, JobStatus } from "./types";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  params TEXT NOT NULL,
  client_token TEXT UNIQUE,
  request_id TEXT,
  status_url TEXT,
  cancel_url TEXT,
  status TEXT NOT NULL,
  error TEXT,
  remote_url TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_created_at ON jobs (created_at DESC);
`;

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

let shared: Db | null = null;

export function getDb(): Db {
  shared ??= openDb(process.env.DB_PATH ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "app.db"));
  return shared;
}

type Row = Omit<Job, "params" | "mode" | "status"> & { params: string; mode: string; status: string };

function toJob(row: Row): Job {
  return { ...row, mode: row.mode as Mode, status: row.status as JobStatus, params: JSON.parse(row.params) };
}

export type NewJob = Pick<Job, "id" | "mode" | "params" | "status"> &
  Partial<Pick<Job, "client_token" | "request_id" | "status_url" | "cancel_url" | "error">>;

export function insertJob(db: Db, job: NewJob, now = new Date()): Job {
  const ts = now.toISOString();
  db.prepare(
    `INSERT INTO jobs (id, mode, params, client_token, request_id, status_url, cancel_url, status, error, remote_url, local_path, created_at, updated_at)
     VALUES (@id, @mode, @params, @client_token, @request_id, @status_url, @cancel_url, @status, @error, NULL, NULL, @ts, @ts)`,
  ).run({
    id: job.id,
    mode: job.mode,
    params: JSON.stringify(job.params),
    client_token: job.client_token ?? null,
    request_id: job.request_id ?? null,
    status_url: job.status_url ?? null,
    cancel_url: job.cancel_url ?? null,
    status: job.status,
    error: job.error ?? null,
    ts,
  });
  return getJob(db, job.id)!;
}

export function getJob(db: Db, id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  return row ? toJob(row) : null;
}

export function findJobByClientToken(db: Db, token: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE client_token = ?").get(token) as Row | undefined;
  return row ? toJob(row) : null;
}

export function listJobs(db: Db, limit = 100): Job[] {
  const rows = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as Row[];
  return rows.map(toJob);
}

const PATCHABLE = ["request_id", "status_url", "cancel_url", "status", "error", "remote_url", "local_path"] as const;
export type JobPatch = Partial<Pick<Job, (typeof PATCHABLE)[number]>>;

export function updateJob(db: Db, id: string, patch: JobPatch, now = new Date()): Job | null {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (keys.length > 0) {
    // column names come from the fixed PATCHABLE list, never from input
    const sets = keys.map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE jobs SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
      ...Object.fromEntries(keys.map((k) => [k, patch[k] ?? null])),
      updated_at: now.toISOString(),
      id,
    });
  }
  return getJob(db, id);
}
