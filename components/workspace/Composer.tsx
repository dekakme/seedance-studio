"use client";

import {
  AlertTriangle,
  AtSign,
  ChevronDown,
  Clock,
  FileVideo,
  Gauge,
  Gem,
  Loader2,
  RectangleHorizontal,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { MediaSlot } from "./MediaSlot";
import { PromptEditor, type InsertRequest } from "./PromptEditor";
import { ReferenceBox } from "./ReferenceBox";
import { estimateForForm, formatUsd } from "@/lib/cost";
import { BITRATE_MODES, MODEL_LABEL, MODE_SPECS, OUTPUT_FORMATS, RESOLUTIONS, type SingleField } from "@/lib/modes";
import {
  DEFAULT_FORM,
  buildInput,
  refLimits,
  resolveMode,
  type ComposerPreset,
  type CreateModel,
  type CreateSub,
  type FormState,
  type KlingTier,
  type Tab,
} from "@/lib/studio-input";
import { refTags, removeRefFromPrompt, unknownTags, type RefItem } from "@/lib/tags";
import type { Job } from "@/lib/types";

const TABS: { id: Tab; label: string }[] = [
  { id: "create", label: "Create Video" },
  { id: "edit", label: "Edit Video" },
  { id: "motion", label: "Motion Control" },
];

const SUBS: Record<CreateModel, { id: CreateSub; label: string }[]> = {
  seedance: [
    { id: "references", label: "References" },
    { id: "frames", label: "Frames" },
    { id: "extend", label: "Extend Video" },
  ],
  kling: [
    { id: "references", label: "Text" },
    { id: "frames", label: "Frames" },
  ],
};

const KLING_TIERS: { id: KlingTier; label: string }[] = [
  { id: "std", label: "Standard" },
  { id: "pro", label: "Pro" },
  { id: "4k", label: "4K" },
];

const FRAME_LABEL: Partial<Record<SingleField, string>> = {
  image_url: "Start frame",
  end_image_url: "End frame",
  last_image_url: "End frame",
};

const chipSelect = "w-full cursor-pointer appearance-none bg-transparent outline-none";
const rowClass = "flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium";

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
  const [model, setModel] = useState<CreateModel>(preset?.model ?? "seedance");
  const [tier, setTier] = useState<KlingTier>(preset?.tier ?? "std");
  const [form, setForm] = useState<FormState>(preset?.form ?? DEFAULT_FORM);
  // video URL -> length in seconds, reported by previews; input video is billed too
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // one token per intended generation: a retry after a network error reuses it, so the server can dedupe
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);

  const mode = resolveMode(tab, sub, form.refs, model, tier);
  const spec = MODE_SPECS[mode];
  const limits = refLimits(mode);
  const showRefs = Object.keys(limits).length > 0;
  const tags = showRefs ? refTags(form.refs) : [];
  const missing = unknownTags(form.prompt, showRefs ? form.refs : []);
  const estimate = estimateForForm(mode, form, durations);
  const sourceSlot = spec.single.find((s) => s.field === "video_url");
  const frameSlots = spec.single.filter((s) => s.field !== "video_url");
  const duration = spec.duration ? Math.min(spec.duration.max, Math.max(spec.duration.min, form.duration)) : null;
  const aspect = spec.aspectRatios?.includes(form.aspect_ratio) ? form.aspect_ratio : spec.aspectRatios?.[0];
  const banner =
    tab === "motion" ? "MOTION CONTROL" : tab === "edit" ? "EDIT" : sub === "frames" ? "FRAMES" : sub === "extend" ? "EXTEND" : "GENERAL";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setMedia = (field: SingleField) => (url: string | undefined) => setForm((f) => ({ ...f, media: { ...f.media, [field]: url } }));
  const onBusy = (d: number) => setUploading((n) => n + d);
  const onDuration = (url: string, seconds: number) => setDurations((d) => (d[url] === seconds ? d : { ...d, [url]: seconds }));
  const addRef = (item: RefItem) => setForm((f) => ({ ...f, refs: [...f.refs, item] }));
  const removeRef = (index: number) =>
    setForm((f) => ({ ...f, prompt: removeRefFromPrompt(f.prompt, f.refs, index), refs: f.refs.filter((_, i) => i !== index) }));
  const insert = (text: string, openMenu = false) => setInsertRequest({ text, openMenu, nonce: Date.now() });

  function changeModel(next: CreateModel) {
    setModel(next);
    // Kling has no extend endpoint
    if (next === "kling" && sub === "extend") setSub("references");
  }

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
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 pb-1 ${t.id === tab ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-800 to-teal-900 p-4">
        <div className="text-xl font-extrabold tracking-wide text-lime-300">{banner}</div>
        <div className="text-xs text-neutral-300">
          {MODEL_LABEL[spec.model]} · {spec.label}
        </div>
      </div>

      {tab === "create" && (
        <div className={`grid gap-1 rounded-2xl bg-white/[0.03] p-1 ${SUBS[model].length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {SUBS[model].map((s) => (
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

      {frameSlots.length > 0 && (
        <div className="flex gap-2">
          {frameSlots.map(({ field, required }) => (
            <MediaSlot
              key={field}
              label={FRAME_LABEL[field] ?? field}
              kind="image"
              required={required}
              value={form.media[field]}
              onChange={setMedia(field)}
              onBusyChange={onBusy}
              onDuration={onDuration}
            />
          ))}
        </div>
      )}
      {sourceSlot && (
        <MediaSlot
          label={tab === "motion" ? "Motion video" : "Source video"}
          kind="video"
          required
          value={form.media.video_url}
          onChange={setMedia("video_url")}
          onBusyChange={onBusy}
          onDuration={onDuration}
        />
      )}
      {showRefs && (
        <ReferenceBox
          title={tab === "motion" ? "Character / style images" : undefined}
          refs={form.refs}
          limits={limits}
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
        placeholder={
          tab === "motion"
            ? "Optional: describe the new character, place or style…"
            : tags.length > 0
              ? "Describe the scene. Type @ to tag a reference, e.g. @Image1 rides past…"
              : "Describe the scene, camera movement and mood…"
        }
        footer={
          <>
            {tags.length > 0 && (
              <button type="button" onClick={() => insert("@", true)} className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium hover:bg-white/10">
                <AtSign size={13} /> Elements
              </button>
            )}
            {spec.audio && (
              <button
                type="button"
                onClick={() => set("generate_audio", !form.generate_audio)}
                className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium hover:bg-white/10"
              >
                {form.generate_audio ? <Volume2 size={13} /> : <VolumeX size={13} />} {form.generate_audio ? "On" : "Off"}
              </button>
            )}
          </>
        }
      />
      {missing.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-300">
          <AlertTriangle size={12} /> {missing.join(", ")} not found in your references
        </p>
      )}

      <label className="relative block rounded-2xl bg-white/[0.03] px-3 py-2">
        <div className="text-xs text-neutral-400">Model</div>
        {tab === "create" ? (
          <>
            <select value={model} onChange={(e) => changeModel(e.target.value as CreateModel)} className={`${chipSelect} pr-6 text-sm font-semibold`}>
              <option value="seedance" className="bg-neutral-900">
                Seedance 2.5
              </option>
              <option value="kling" className="bg-neutral-900">
                Kling 3.0
              </option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          </>
        ) : (
          <div className="text-sm font-semibold">{MODEL_LABEL[spec.model]}</div>
        )}
      </label>

      {spec.model === "kling" && (
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.03] p-1">
          {KLING_TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={`rounded-xl py-1.5 text-sm ${t.id === tier ? "bg-white/10 font-semibold text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(duration !== null || spec.aspectRatios || spec.resolution) && (
        <div className="flex gap-2">
          {duration !== null && (
            <Chip icon={<Clock size={14} />} title="Duration">
              <select value={duration} onChange={(e) => set("duration", Number(e.target.value))} className={chipSelect}>
                {Array.from({ length: spec.duration!.max - spec.duration!.min + 1 }, (_, i) => spec.duration!.min + i).map((s) => (
                  <option key={s} value={s} className="bg-neutral-900">
                    {s}s
                  </option>
                ))}
              </select>
            </Chip>
          )}
          {spec.aspectRatios && (
            <Chip icon={<RectangleHorizontal size={14} />} title="Aspect ratio">
              <select value={aspect} onChange={(e) => set("aspect_ratio", e.target.value)} className={chipSelect}>
                {spec.aspectRatios.map((r) => (
                  <option key={r} className="bg-neutral-900">
                    {r}
                  </option>
                ))}
              </select>
            </Chip>
          )}
          {spec.resolution && (
            <Chip icon={<Gem size={14} />} title="Resolution">
              <select value={form.resolution} onChange={(e) => set("resolution", e.target.value)} className={chipSelect}>
                {RESOLUTIONS.map((r) => (
                  <option key={r} className="bg-neutral-900">
                    {r}
                  </option>
                ))}
              </select>
            </Chip>
          )}
        </div>
      )}

      {spec.bitrate && (
        <label className={rowClass}>
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
      )}
      {spec.cfgScale && (
        <label className={rowClass} title="How closely Kling follows the prompt (higher = stricter)">
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-neutral-400" /> CFG
          </span>
          <span className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.cfg_scale}
              onChange={(e) => set("cfg_scale", Math.round(Number(e.target.value) * 100) / 100)}
              className="w-28 accent-lime-300"
            />
            <span className="w-8 text-right font-semibold text-lime-300">{form.cfg_scale.toFixed(2)}</span>
          </span>
        </label>
      )}
      {spec.outputFormat && (
        <label className={rowClass}>
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
            <Sparkles size={16} /> Generate {estimate && <span className="rounded-md bg-black/10 px-1.5 text-sm">≈ {formatUsd(estimate.usd)}</span>}
          </>
        )}
      </button>
      <div className="text-center text-[11px] leading-4 text-neutral-500">
        {estimate ? (
          <>
            {estimate.detail}
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
