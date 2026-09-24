"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";
import { JobCard } from "./JobCard";

export function Gallery({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <p className="text-neutral-400">
        No videos yet.{" "}
        <Link href="/" className="underline">
          Generate one
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <JobCard key={job.id} initial={job} />
      ))}
    </div>
  );
}
