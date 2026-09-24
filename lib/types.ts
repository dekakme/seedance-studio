import type { Mode } from "./modes";

export const JOB_STATUSES = ["queued", "in_progress", "completed", "failed", "nsfw", "canceled", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isTerminal(status: JobStatus): boolean {
  return status !== "queued" && status !== "in_progress";
}

export interface Job {
  id: string;
  mode: Mode;
  /** exact payload sent to Higgsfield */
  params: Record<string, unknown>;
  /** browser-generated token that makes submissions idempotent */
  client_token: string | null;
  request_id: string | null;
  status_url: string | null;
  cancel_url: string | null;
  status: JobStatus;
  error: string | null;
  remote_url: string | null;
  /** file name inside storage/videos */
  local_path: string | null;
  created_at: string;
  updated_at: string;
}
