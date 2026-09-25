"use client";

import { useEffect, useState } from "react";
import { isTerminal, type Job } from "@/lib/types";

// Higgsfield's polling guidance: start at 2s, grow ×1.5 up to 10s, add jitter
const POLL_START_MS = 2000;
const POLL_MAX_MS = 10000;

async function fetchJob(id: string): Promise<Job | null> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { job: Job }).job;
}

/** Keeps a job fresh while it runs; the server refreshes it from Higgsfield on every poll. */
export function useJob(initial: Job): [Job, (job: Job) => void] {
  const [job, setJob] = useState(initial);
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

  return [job, setJob];
}

/** "m:ss" since `since`, ticking every second while active. */
export function useElapsed(since: string, active: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
