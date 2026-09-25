"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { estimateJobCost, formatUsd } from "@/lib/cost";
import { MODE_SPECS } from "@/lib/modes";
import { isTerminal, type Job, type JobStatus } from "@/lib/types";

const BADGE: Record<JobStatus, string> = {
  queued: "bg-neutral-700 text-neutral-200",
  in_progress: "bg-blue-900 text-blue-200",
  completed: "bg-green-900 text-green-200",
  failed: "bg-red-900 text-red-200",
  nsfw: "bg-orange-900 text-orange-200",
  canceled: "bg-neutral-800 text-neutral-400",
  error: "bg-red-900 text-red-200",
};

// Higgsfield's polling guidance: start at 2s, grow ×1.5 up to 10s, add jitter
const POLL_START_MS = 2000;
const POLL_MAX_MS = 10000;

async function fetchJob(id: string): Promise<Job | null> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { job: Job }).job;
}

export function JobCard({ initial }: { initial: Job }) {
  const [job, setJob] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const terminal = isTerminal(job.status);

  useEffect(() => {
    if (terminal) return;
    let alive = true;
    let delay = POLL_START_MS;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(tick, delay + Math.random() * 500);
    };
    const tick = async () => {
      const next = await fetchJob(job.id).catch(() => null);
      if (!alive) return;
      if (next) setJob(next);
      delay = Math.min(delay * 1.5, POLL_MAX_MS);
      schedule();
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job.id, terminal]);

  // a finished job whose download failed earlier: retry once per page load
  useEffect(() => {
    if (initial.status === "completed" && initial.remote_url && !initial.local_path) {
      void fetchJob(initial.id).then((next) => next && setJob(next));
    }
  }, [initial]);

  async function cancel() {
    setActionError(null);
    const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { job?: Job; error?: string };
    if (res.ok && body.job) setJob(body.job);
    else setActionError(body.error ?? `Cancel failed (${res.status})`);
  }

  const prompt = typeof job.params.prompt === "string" ? job.params.prompt : "";
  const videoSrc = job.local_path ? `/api/videos/${job.id}` : job.remote_url;
  const reuse = `/?${new URLSearchParams({ mode: job.mode, prompt })}`;
  // nothing is billed when the submit itself failed
  const cost = job.status === "error" ? null : estimateJobCost(job);

  return (
    <article id={`job-${job.id}`} className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-400">
          {MODE_SPECS[job.mode].label} · {new Date(job.created_at).toLocaleString()}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${BADGE[job.status]}`}>{job.status.replace("_", " ")}</span>
      </header>

      {job.status === "completed" && videoSrc ? (
        <video src={videoSrc} controls playsInline className="aspect-video w-full rounded-lg bg-black" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-950 text-sm text-neutral-500">
          {terminal ? "No video" : "Generating…"}
        </div>
      )}

      {prompt && <p className="line-clamp-3 text-sm text-neutral-300">{prompt}</p>}
      {cost && (
        <p className="text-xs text-neutral-500">
          Est. cost ≈ {formatUsd(cost.usd)}
          {cost.partial && " + input video"}
        </p>
      )}
      {job.error && <p className="text-sm text-red-400">{job.error}</p>}
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      <footer className="flex flex-wrap gap-3 text-sm">
        {job.status === "queued" && (
          <button onClick={cancel} className="text-neutral-400 hover:text-white">
            Cancel
          </button>
        )}
        {job.status === "completed" && videoSrc && (
          <a href={videoSrc} download className="text-neutral-400 hover:text-white">
            Download
          </a>
        )}
        <Link href={reuse} className="text-neutral-400 hover:text-white">
          Reuse prompt
        </Link>
        {job.status === "completed" && job.remote_url && (
          <>
            <Link href={`/?mode=extend&video_url=${encodeURIComponent(job.remote_url)}`} className="text-neutral-400 hover:text-white">
              Extend
            </Link>
            <Link href={`/?mode=edit&video_url=${encodeURIComponent(job.remote_url)}`} className="text-neutral-400 hover:text-white">
              Edit
            </Link>
          </>
        )}
      </footer>
    </article>
  );
}
