"use client";

import {
  AlertTriangle,
  Ban,
  BarChart3,
  Copy,
  Download,
  FastForward,
  Loader2,
  PenLine,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Lightbox, type PreviewItem } from "./Lightbox";
import { MediaThumb } from "./MediaThumb";
import { useElapsed, useJob } from "./useJob";
import { estimateJobCost, formatUsd } from "@/lib/cost";
import { catalogIdOf, isCatalogMode, type CatalogLabels } from "@/lib/catalog";
import { MODEL_LABEL, MODE_SPECS, type MediaKind } from "@/lib/modes";
import { splitByTags } from "@/lib/tags";
import { isTerminal, type Job, type JobStatus } from "@/lib/types";

const STATUS: Record<JobStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-neutral-700 text-neutral-200" },
  in_progress: { label: "Generating", className: "bg-blue-500/20 text-blue-200" },
  completed: { label: "Done", className: "bg-lime-300/15 text-lime-300" },
  failed: { label: "Failed", className: "bg-red-500/20 text-red-300" },
  nsfw: { label: "Blocked", className: "bg-orange-500/20 text-orange-300" },
  canceled: { label: "Canceled", className: "bg-neutral-800 text-neutral-400" },
  error: { label: "Error", className: "bg-red-500/20 text-red-300" },
};

interface Props {
  initial: Job;
  view: "list" | "grid";
  onCreated: (job: Job) => void;
  onReuse: (job: Job) => void;
  onExtend: (job: Job) => void;
  onDeleted: (id: string) => void;
  onOpen: (id: string) => void;
  /** family / workflow names for catalog jobs, keyed by model id */
  catalogLabels: CatalogLabels;
}

// fixed locale so server and browser render the same text
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function paramRefs(p: Record<string, unknown>): { kind: MediaKind; url: string; label: string }[] {
  const out: { kind: MediaKind; url: string; label: string }[] = [];
  const start = str(p.image_url);
  const end = str(p.end_image_url) ?? str(p.last_image_url);
  const source = str(p.video_url);
  if (start) out.push({ kind: "image", url: start, label: "Start" });
  if (end) out.push({ kind: "image", url: end, label: "End" });
  if (source) out.push({ kind: "video", url: source, label: "Source" });
  strs(p.image_urls).forEach((url, i) => out.push({ kind: "image", url, label: `Image${i + 1}` }));
  strs(p.video_urls).forEach((url, i) => out.push({ kind: "video", url, label: `Video${i + 1}` }));
  strs(p.audio_urls).forEach((url, i) => out.push({ kind: "audio", url, label: `Audio${i + 1}` }));
  return out;
}

function TaggedText({ text }: { text: string }) {
  return splitByTags(text).map((part, i) =>
    part.tag ? (
      <span key={i} className="rounded bg-lime-300/15 text-lime-300">
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

function IconButton({ title, onClick, href, children }: { title: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const className = "flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-neutral-300 hover:bg-white/10 hover:text-white";
  return href ? (
    <a href={href} download title={title} aria-label={title} className={className}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={className}>
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status].className}`}>{STATUS[status].label}</span>;
}

export function FeedItem({ initial, view, onCreated, onReuse, onExtend, onDeleted, onOpen, catalogLabels }: Props) {
  const [job, setJob] = useJob(initial);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const running = !isTerminal(job.status);
  const elapsed = useElapsed(job.created_at, running);

  const p = job.params;
  const prompt = str(p.prompt) ?? "";
  const videoSrc = job.local_path ? `/api/videos/${job.id}` : job.remote_url;
  const done = job.status === "completed" && !!videoSrc;
  const cost = job.status === "error" ? null : estimateJobCost(job);

  const placeholder = (
    <div className="flex flex-col items-center gap-2 text-sm text-neutral-400">
      {running ? <Loader2 className="animate-spin" /> : <AlertTriangle className="text-red-300" />}
      <span>{running ? `${STATUS[job.status].label} · ${elapsed}` : job.status === "completed" ? "No video returned" : STATUS[job.status].label}</span>
    </div>
  );

  async function rerun() {
    if (!confirm(`Run this generation again${cost ? ` (≈ ${formatUsd(cost.usd)})` : ""}?`)) return;
    setError(null);
    setWorking(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: job.mode, input: job.params, client_token: crypto.randomUUID() }),
      });
      const body = (await res.json().catch(() => ({}))) as { job?: Job; error?: string };
      if (body.job) onCreated(body.job);
      if (!res.ok) setError(body.error ?? `Rerun failed (${res.status})`);
    } catch {
      setError("Network error, try again");
    } finally {
      setWorking(false);
    }
  }

  async function cancel() {
    setError(null);
    const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { job?: Job; error?: string };
    if (res.ok && body.job) setJob(body.job);
    else setError(body.error ?? `Cancel failed (${res.status})`);
  }

  async function remove() {
    const question = running
      ? "Remove this generation from your history? It keeps running (and billing) on Higgsfield."
      : "Delete this generation and its downloaded video?";
    if (!confirm(question)) return;
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (res.ok || res.status === 404) onDeleted(job.id);
    else setError(`Delete failed (${res.status})`);
  }

  if (view === "grid") {
    return (
      <button
        type="button"
        onClick={() => onOpen(job.id)}
        className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black/40 text-left"
      >
        {done ? (
          <video
            src={videoSrc!}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
            className="h-full w-full object-cover"
          />
        ) : (
          placeholder
        )}
        <span className="absolute left-2 top-2">
          <StatusPill status={job.status} />
        </span>
        {prompt && (
          <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6 text-xs text-neutral-200">
            {prompt}
          </span>
        )}
      </button>
    );
  }

  // curated modes carry their own spec; catalog jobs are labelled from the synced catalog
  const spec = isCatalogMode(job.mode) ? null : MODE_SPECS[job.mode];
  const catalogLabel = isCatalogMode(job.mode) ? catalogLabels[catalogIdOf(job.mode)] : undefined;
  const modelLabel = spec ? MODEL_LABEL[spec.model] : (catalogLabel?.family ?? "Higgsfield model");
  const workflowLabel = spec ? spec.label : (catalogLabel?.workflow ?? job.mode.slice("catalog:".length));
  const hasAudio = spec ? !!spec.audio : "generate_audio" in p || "sound" in p;
  const refs = paramRefs(p);
  const chips = [
    str(p.resolution),
    typeof p.duration === "number" || typeof p.duration === "string" ? `${p.duration}s` : "Auto length",
    str(p.aspect_ratio) ?? "Auto frame",
    hasAudio ? (p.generate_audio === false || p.sound === "off" ? "No audio" : "Audio") : undefined,
    typeof p.cfg_scale === "number" ? `CFG ${p.cfg_scale}` : undefined,
  ].filter((c): c is string => !!c);

  return (
    <article id={`job-${job.id}`} className="grid scroll-mt-16 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative flex min-h-[360px] items-center justify-center rounded-2xl bg-black/40 p-4">
        {done ? <video src={videoSrc!} controls playsInline preload="metadata" className="max-h-[72vh] max-w-full rounded-xl" /> : placeholder}
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          {done && (
            <IconButton title="Download" href={videoSrc!}>
              <Download size={15} />
            </IconButton>
          )}
          {job.status === "completed" && job.remote_url && (
            <IconButton title="Extend this video" onClick={() => onExtend(job)}>
              <FastForward size={15} />
            </IconButton>
          )}
          <IconButton title="Load these settings into the composer" onClick={() => onReuse(job)}>
            <PenLine size={15} />
          </IconButton>
        </div>
      </div>

      <aside className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs font-semibold">
            <BarChart3 size={12} className="text-lime-300" /> {modelLabel}
          </span>
          <StatusPill status={job.status} />
        </div>
        {/* the browser's time zone can differ from the server's, so let the client render its own time */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500" suppressHydrationWarning>
          {workflowLabel} · {DATE_FORMAT.format(new Date(job.created_at))}
        </div>
        {prompt ? (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-neutral-300">
            <TaggedText text={prompt} />
          </p>
        ) : (
          <p className="text-sm text-neutral-500">No prompt</p>
        )}
        {refs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {refs.map((r, i) => (
              <button key={`${r.url}-${i}`} type="button" onClick={() => setPreview(r)} className="relative" title={`Preview ${r.label}`}>
                <MediaThumb kind={r.kind} url={r.url} className="h-11 w-11" />
                <span className="absolute bottom-0 left-0 rounded bg-black/75 px-0.5 text-[9px] text-lime-300">{r.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="rounded-lg bg-white/5 px-2 py-1 text-xs font-medium text-neutral-300">
              {c}
            </span>
          ))}
        </div>
        {cost && (
          <p className="text-xs text-neutral-500">
            Est. cost ≈ {formatUsd(cost.usd)}
            {cost.partial && " + input video"}
          </p>
        )}
        {job.error && <p className="text-sm text-red-400">{job.error}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="mt-auto flex items-center gap-1 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={rerun}
            disabled={working}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-50"
          >
            {working ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Rerun
          </button>
          {job.status === "queued" && (
            <button type="button" onClick={cancel} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-neutral-200 hover:bg-white/5">
              <Ban size={14} /> Cancel
            </button>
          )}
          <div className="ml-auto flex gap-1">
            {prompt && (
              <IconButton title="Copy prompt" onClick={() => void navigator.clipboard.writeText(prompt)}>
                <Copy size={14} />
              </IconButton>
            )}
            <IconButton title="Delete" onClick={remove}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>
      </aside>
      <Lightbox item={preview} onClose={() => setPreview(null)} />
    </article>
  );
}
