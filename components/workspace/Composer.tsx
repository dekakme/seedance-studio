"use client";

import { AlertTriangle, AtSign, BarChart3, Clock, FileVideo, Gauge, Gem, Loader2, RectangleHorizontal, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { MediaSlot } from "./MediaSlot";
import { PromptEditor, type InsertRequest } from "./PromptEditor";
import { ReferenceBox } from "./ReferenceBox";
import { estimateForForm, formatUsd } from "@/lib/cost";
import { ASPECT_RATIOS, BITRATE_MODES, DURATION, MODE_SPECS, OUTPUT_FORMATS, RESOLUTIONS, type SingleField } from "@/lib/modes";
import { DEFAULT_FORM, buildInput, refLimits, resolveMode, type CreateSub, type FormState, type Tab } from "@/lib/studio-input";
import { refTags, removeRefFromPrompt, unknownTags, type RefItem } from "@/lib/tags";
import type { Job } from "@/lib/types";

export interface ComposerPreset {
  tab: Tab;
  sub: CreateSub;
  form: FormState;
}

const SUBS: { id: CreateSub; label: string }[] = [
  { id: "references", label: "References" },
  { id: "frames", label: "Frames" },
  { id: "extend", label: "Extend Video" },
];

const DURATIONS = Array.from({ length: DURATION.max - DURATION.min + 1 }, (_, i) => DURATION.min + i);
const chipSelect = "w-full cursor-pointer appearance-none bg-transparent outline-none";

function Chip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <label title={title} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold hover:bg-white/[0.08]">
      <span className="shrink-0 text-neutral-400">{icon}</span>
      {children}
    </label>
  );
}

export function Composer({ preset, onCreated }: { preset?: ComposerPreset; onCreated: (job: Job) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(preset?.tab ?? "create");
  const [sub, setSub] = useState<CreateSub>(preset?.sub ?? "references");
  const [form, setForm] = useState<FormState>(preset?.form ?? DEFAULT_FORM);
  // video URL -> length in seconds, reported by previews; input video is billed too
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // one token per intended generation: a retry after a network error reuses it, so the server can dedupe
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);

  const mode = resolveMode(tab, sub, form.refs);
  const spec = MODE_SPECS[mode];
  const showRefs = !(tab === "create" && sub === "frames");
  const tags = showRefs ? refTags(form.refs) : [];
  const missing = unknownTags(form.prompt, showRefs ? form.refs : []);
  const estimate = estimateForForm(mode, form, durations);
  const banner = tab === "edit" ? "EDIT" : sub === "frames" ? "FRAMES" : sub === "extend" ? "EXTEND" : "GENERAL";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setMedia = (field: SingleField) => (url: string | undefined) => setForm((f) => ({ ...f, media: { ...f.media, [field]: url } }));
  const onBusy = (d: number) => setUploading((n) => n + d);
  const onDuration = (url: string, seconds: number) => setDurations((d) => (d[url] === seconds ? d : { ...d, [url]: seconds }));
  const addRef = (item: RefItem) => setForm((f) => ({ ...f, refs: [...f.refs, item] }));
  const removeRef = (index: number) =>
    setForm((f) => ({ ...f, prompt: removeRefFromPrompt(f.prompt, f.refs, index), refs: f.refs.filter((_, i) => i !== index) }));
  const insert = (text: string, openMenu = false) => setInsertRequest({ text, openMenu, nonce: Date.now() });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input: buildInput(mode, form), client_token: clientToken }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        job?: Job;
        error?: string;
        errors?: { path: string; message: string }[];
      };
      // the server recorded a job for this token, so the next submit is a new generation
      if (body.job) {
        setClientToken(crypto.randomUUID());
        onCreated(body.job);
      }
      if (!res.ok) {
        setErrors(body.errors?.map((x) => `${x.path || "input"}: ${x.message}`) ?? [body.error ?? `Request failed (${res.status})`]);
      }
    } catch {
      setErrors(["Network error, try again"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-4 px-1 text-sm font-semibold">
        {(["create", "edit"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 pb-1 ${t === tab ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            {t === "create" ? "Create Video" : "Edit Video"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-800 to-teal-900 p-4">
        <div className="text-xl font-extrabold tracking-wide text-lime-300">{banner}</div>
        <div className="text-xs text-neutral-300">Seedance 2.5 · {spec.label}</div>
      </div>

      {tab === "create" && (
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.03] p-1">
          {SUBS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              className={`rounded-xl py-2 text-sm ${s.id === sub ? "bg-white/10 font-semibold text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {tab === "create" && sub === "frames" && (
        <div className="flex gap-2">
          <MediaSlot label="Start frame" kind="image" required value={form.media.image_url} onChange={setMedia("image_url")} onBusyChange={onBusy} onDuration={onDuration} />
          <MediaSlot label="End frame" kind="image" value={form.media.end_image_url} onChange={setMedia("end_image_url")} onBusyChange={onBusy} onDuration={onDuration} />
        </div>
      )}
      {(tab === "edit" || sub === "extend") && (
        <MediaSlot label="Source video" kind="video" required value={form.media.video_url} onChange={setMedia("video_url")} onBusyChange={onBusy} onDuration={onDuration} />
      )}
      {showRefs && (
        <ReferenceBox
          refs={form.refs}
          limits={refLimits(mode)}
          onAdd={addRef}
          onRemove={removeRef}
          onTag={(tag) => insert(tag)}
          onBusyChange={onBusy}
          onDuration={onDuration}
        />
      )}

      <PromptEditor
        value={form.prompt}
        onChange={(v) => set("prompt", v)}
        tags={tags}
        insertRequest={insertRequest}
        placeholder={tags.length > 0 ? "Describe the scene. Type @ to tag a reference, e.g. @Image1 rides past…" : "Describe the scene, camera movement and mood…"}
        footer={
          <>
            {tags.length > 0 && (
              <button type="button" onClick={() => insert("@", true)} className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium hover:bg-white/10">
                <AtSign size={13} /> Elements
              </button>
            )}
            <button
              type="button"
              onClick={() => set("generate_audio", !form.generate_audio)}
              className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium hover:bg-white/10"
            >
              {form.generate_audio ? <Volume2 size={13} /> : <VolumeX size={13} />} {form.generate_audio ? "On" : "Off"}
            </button>
          </>
        }
      />
      {missing.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-300">
          <AlertTriangle size={12} /> {missing.join(", ")} not found in your references
        </p>
      )}

      <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2">
        <div>
          <div className="text-xs text-neutral-400">Model</div>
          <div className="flex items-center gap-1 text-sm font-semibold">
            Seedance 2.5 <BarChart3 size={14} className="text-lime-300" />
          </div>
        </div>
        <span className="text-xs text-neutral-500">{spec.label}</span>
      </div>

      <div className="flex gap-2">
        <Chip icon={<Clock size={14} />} title="Duration">
          {spec.duration ? (
            <select value={form.duration} onChange={(e) => set("duration", Number(e.target.value))} className={chipSelect}>
              {DURATIONS.map((s) => (
                <option key={s} value={s} className="bg-neutral-900">
                  {s}s
                </option>
              ))}
            </select>
          ) : (
            <span className="text-neutral-400">Auto</span>
          )}
        </Chip>
        <Chip icon={<RectangleHorizontal size={14} />} title="Aspect ratio">
          {spec.aspectRatio ? (
            <select value={form.aspect_ratio} onChange={(e) => set("aspect_ratio", e.target.value)} className={chipSelect}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r} className="bg-neutral-900">
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-neutral-400">Auto</span>
          )}
        </Chip>
        <Chip icon={<Gem size={14} />} title="Resolution">
          <select value={form.resolution} onChange={(e) => set("resolution", e.target.value)} className={chipSelect}>
            {RESOLUTIONS.map((r) => (
              <option key={r} className="bg-neutral-900">
                {r}
              </option>
            ))}
          </select>
        </Chip>
      </div>

      <label className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium">
        <span className="flex items-center gap-2">
          <Gauge size={16} className="text-neutral-400" /> Bitrate
        </span>
        <select value={form.bitrate_mode} onChange={(e) => set("bitrate_mode", e.target.value)} className="cursor-pointer appearance-none bg-transparent text-right font-semibold capitalize text-lime-300 outline-none">
          {BITRATE_MODES.map((b) => (
            <option key={b} value={b} className="bg-neutral-900 capitalize">
              {b}
            </option>
          ))}
        </select>
      </label>
      {spec.outputFormat && (
        <label className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium">
          <span className="flex items-center gap-2">
            <FileVideo size={16} className="text-neutral-400" /> Format
          </span>
          <select value={form.output_format} onChange={(e) => set("output_format", e.target.value)} className="cursor-pointer appearance-none bg-transparent text-right font-semibold uppercase outline-none">
            {OUTPUT_FORMATS.map((f) => (
              <option key={f} value={f} className="bg-neutral-900">
                {f}
              </option>
            ))}
          </select>
        </label>
      )}

      {errors.length > 0 && (
        <ul className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        disabled={busy || uploading > 0}
        className="flex items-center justify-center gap-2 rounded-2xl bg-[#d7ff3a] py-3.5 text-base font-semibold text-black shadow-[0_0_24px_rgba(215,255,58,0.2)] hover:bg-[#cbf22e] disabled:opacity-50"
      >
        {uploading > 0 ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Uploading…
          </>
        ) : busy ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Submitting…
          </>
        ) : (
          <>
            Generate {estimate && <span className="rounded-md bg-black/10 px-1.5 text-sm">≈ {formatUsd(estimate.usd)}</span>}
          </>
        )}
      </button>
      <div className="text-center text-[11px] leading-4 text-neutral-500">
        {estimate ? (
          <>
            {estimate.tokens.toLocaleString("en-US")} video tokens × $0.0214 / 1K
            {estimate.notes.map((n) => (
              <span key={n} className="block">
                {n}
              </span>
            ))}
          </>
        ) : (
          "Add the source video to see the estimated cost."
        )}
      </div>
    </form>
  );
}
