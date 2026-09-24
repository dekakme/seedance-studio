import { getJob, updateJob, type Db } from "./db";
import type { HiggsfieldClient } from "./higgsfield";
import type { Job } from "./types";

/** Give up on a job that is still queued or running after this long. */
export const JOB_TIMEOUT_MS = 60 * 60 * 1000;

export interface RefreshDeps {
  db: Db;
  hf: Pick<HiggsfieldClient, "getStatus">;
  download(url: string, fileName: string): Promise<string>;
}

export function videoFileName(job: Pick<Job, "id" | "params">): string {
  return `${job.id}.${job.params.output_format === "mov" ? "mov" : "mp4"}`;
}

async function doRefresh(deps: RefreshDeps, id: string): Promise<Job | null> {
  let job = getJob(deps.db, id);
  if (!job) return null;

  if ((job.status === "queued" || job.status === "in_progress") && job.status_url) {
    try {
      const s = await deps.hf.getStatus(job.status_url);
      const failed = s.status === "failed" || s.status === "nsfw";
      job = updateJob(deps.db, id, {
        status: s.status,
        remote_url: s.videoUrl ?? job.remote_url,
        error: failed ? (s.error ?? s.status) : job.error,
      })!;
    } catch (err) {
      console.warn(`[jobs] status check failed for ${id}:`, err);
    }
  }

  if ((job.status === "queued" || job.status === "in_progress") && Date.now() - Date.parse(job.created_at) > JOB_TIMEOUT_MS) {
    return updateJob(deps.db, id, { status: "error", error: "Timed out waiting for Higgsfield" });
  }

  if (job.status === "completed" && job.remote_url && !job.local_path) {
    try {
      const fileName = await deps.download(job.remote_url, videoFileName(job));
      job = updateJob(deps.db, id, { local_path: fileName })!;
    } catch (err) {
      // keep the job completed; the gallery falls back to remote_url and the next refresh retries
      console.warn(`[jobs] download failed for ${id}:`, err);
    }
  }
  return job;
}

// one refresh per job at a time, so two open tabs don't download the same video twice
const inflight = new Map<string, Promise<Job | null>>();

export function refreshJob(deps: RefreshDeps, id: string): Promise<Job | null> {
  const running = inflight.get(id);
  if (running) return running;
  const p = doRefresh(deps, id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
