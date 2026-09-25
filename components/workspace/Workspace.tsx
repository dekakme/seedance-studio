"use client";

import { History, LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { Composer } from "./Composer";
import { FeedItem } from "./FeedItem";
import { DEFAULT_FORM, formFromJob, type ComposerPreset } from "@/lib/studio-input";
import type { Job } from "@/lib/types";

type View = "list" | "grid";

export function Workspace({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [view, setView] = useState<View>("list");
  // remounts the composer with new values when a job is reused or extended
  const [preset, setPreset] = useState<{ key: number; value: ComposerPreset } | null>(null);

  const load = (value: ComposerPreset) => {
    setPreset({ key: Date.now(), value });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onCreated = (job: Job) => setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)]);
  const onDeleted = (id: string) => setJobs((list) => list.filter((j) => j.id !== id));
  const onOpen = (id: string) => {
    setView("list");
    setTimeout(() => document.getElementById(`job-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-49px)] lg:flex-row">
      <aside className="shrink-0 border-white/5 p-3 lg:w-[340px] lg:overflow-y-auto lg:border-r">
        <Composer key={preset?.key ?? 0} preset={preset?.value} onCreated={onCreated} />
      </aside>

      <section className="min-w-0 flex-1 p-3 lg:overflow-y-auto">
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-[#0b0b0c]/85 py-1 backdrop-blur">
          <span className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium">
            <History size={14} /> History <span className="text-neutral-500">{jobs.length}</span>
          </span>
          <div className="ml-auto flex rounded-lg bg-white/5 p-0.5 text-sm">
            {(["list", "grid"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 capitalize ${v === view ? "bg-white/10 font-semibold text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {v === "list" ? <List size={14} /> : <LayoutGrid size={14} />} {v}
              </button>
            ))}
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="flex h-[60vh] items-center justify-center text-sm text-neutral-500">Your generations will appear here.</div>
        ) : (
          <div className={view === "grid" ? "grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4" : "flex flex-col gap-6"}>
            {jobs.map((job) => (
              <FeedItem
                key={job.id}
                initial={job}
                view={view}
                onCreated={onCreated}
                onDeleted={onDeleted}
                onOpen={onOpen}
                onReuse={(j) => load(formFromJob(j))}
                onExtend={(j) =>
                  load({
                    tab: "create",
                    sub: "extend",
                    model: "seedance",
                    tier: "std",
                    form: { ...DEFAULT_FORM, media: { video_url: j.remote_url ?? undefined } },
                  })
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
