"use client";

import {
  AlertTriangle,
  AtSign,
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
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MediaSlot } from "./MediaSlot";
import { DurationPicker, PopoverSelect, type PopoverOption } from "./Popover";
import { PromptEditor, type InsertRequest } from "./PromptEditor";
import { ReferenceBox } from "./ReferenceBox";
import { GENJUTSU_USD_PER_SECOND, KLING_USD_PER_SECOND, estimateForForm, formatUsd } from "@/lib/cost";
import { MODEL_LABEL, MODE_SPECS, OUTPUT_FORMATS, RESOLUTIONS, type SingleField } from "@/lib/modes";
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
  genjutsu: [
    { id: "motion", label: "Motion transfer" },
    { id: "swap", label: "Objects swap" },
  ],
};

const MODEL_OPTIONS: PopoverOption<CreateModel>[] = [
  { value: "seedance", label: "Seedance 2.5", badge: "TOP", meta: ["720p", "4s–30s", "Audio"] },
  { value: "kling", label: "Kling 3.0", meta: ["Std · Pro · 4K", "3s–15s", "Audio"] },
  { value: "genjutsu", label: "Higgsfield Genjutsu", badge: "NEW", meta: ["720p", "1s–30s", "Motion · Swap"] },
];

const KLING_TIER_OPTIONS: PopoverOption<KlingTier>[] = (["std", "pro", "4k"] as const).map((t) => ({
  value: t,
  label: t === "std" ? "Standard" : t === "pro" ? "Pro" : "4K",
  meta: [`$${KLING_USD_PER_SECOND[t]}/s`],
}));

const BITRATE_OPTIONS: PopoverOption<string>[] = [
  { value: "high", label: "High", description: "Less compression · larger size", icon: <Sparkles size={16} /> },
  { value: "standard", label: "Standard", description: "More compression · smaller size", icon: <Zap size={16} /> },
];

/** Small outline box drawn at the given aspect ratio, for the aspect ratio list. */
function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 16 / Math.max(w, h);
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(4, w * scale), height: Math.max(4, h * scale) }} />
    </span>
  );
}

const FRAME_LABEL: Partial<Record<SingleField, string>> = {
  image_url: "Start frame",
  end_image_url: "End frame",
  last_image_url: "End frame",
};

const rowClass = "flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium";

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className={`relative h-5 w-9 rounded-full transition ${on ? "bg-[#d7ff3a]" : "bg-white/15"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px] bg-black" : "left-0.5"}`} />
    </button>
  );
}

export function Composer({ preset, onCreated }: { preset?: ComposerPreset; onCreated: (job: Job) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(preset?.tab ?? "create");
  const [sub, setSub] = useState<CreateSub>(preset?.sub ?? "references");
  const [model, setModel] = useState<CreateModel>(preset?.model ?? "seedance");
  const [tier, setTier] = useState<KlingTier>(preset?.tier ?? "std");
  const [form, setForm] = useState<FormState>(preset?.form ?? DEFAULT_FORM);
  // Genjutsu's prompt is optional and switched on explicitly, like Higgsfield's toggle
  const [promptOn, setPromptOn] = useState(Boolean(preset?.form.prompt));
  // video URL -> length in seconds, reported by previews; input video is billed too
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // one token per intended generation: a retry after a network error reuses it, so the server can dedupe
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);

  // Edit Video is always Seedance; a sub-tab left over from another model falls back to the first one
  const activeModel: CreateModel = tab === "edit" ? "seedance" : model;
  const activeSub = SUBS[activeModel].some((s) => s.id === sub) ? sub : SUBS[activeModel][0].id;
  const mode = resolveMode(tab, activeSub, form.refs, activeModel, tier);
  const spec = MODE_SPECS[mode];
  const isGenjutsu = spec.model === "genjutsu";
  const showPrompt = !isGenjutsu || promptOn;
  const limits = refLimits(mode);
  const showRefs = Object.keys(limits).length > 0;
  const tags = showRefs ? refTags(form.refs) : [];
  const missing = showPrompt ? unknownTags(form.prompt, showRefs ? form.refs : []) : [];
  const estimate = estimateForForm(mode, form, durations);
  const sourceSlot = spec.single.find((s) => s.field === "video_url");
  const frameSlots = spec.single.filter((s) => s.field !== "video_url");
  const duration = spec.duration ? Math.min(spec.duration.max, Math.max(spec.duration.min, form.duration)) : null;
  const aspect = spec.aspectRatios?.includes(form.aspect_ratio) ? form.aspect_ratio : spec.aspectRatios?.[0];

  const banner = isGenjutsu
    ? { title: "HIGGSFIELD GENJUTSU", subtitle: `Reality manipulation · ${spec.label}` }
    : {
        title: tab === "edit" ? "EDIT" : activeSub === "frames" ? "FRAMES" : activeSub === "extend" ? "EXTEND" : "GENERAL",
        subtitle: `${MODEL_LABEL[spec.model]} · ${spec.label}`,
      };

  const qualityOptions: PopoverOption<string>[] = RESOLUTIONS.map((r) => ({
    value: r,
    label: r,
    meta: isGenjutsu ? [`$${GENJUTSU_USD_PER_SECOND[r]}/s of input`] : undefined,
  }));

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
    if (!SUBS[next].some((s) => s.id === sub)) setSub(SUBS[next][0].id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const input = buildInput(mode, showPrompt ? form : { ...form, prompt: "" });
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input, client_token: clientToken }),
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

  const promptEditor = (
    <PromptEditor
      value={form.prompt}
      onChange={(v) => set("prompt", v)}
      tags={tags}
      insertRequest={insertRequest}
      placeholder={
        isGenjutsu
          ? activeSub === "swap"
            ? "Describe what to replace, e.g. swap the car for @Image1…"
            : "Describe the new character, place or style…"
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
  );

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

      <div className={`rounded-2xl p-4 ${isGenjutsu ? "bg-gradient-to-br from-neutral-800 via-zinc-900 to-lime-950" : "bg-gradient-to-br from-indigo-900 via-slate-800 to-teal-900"}`}>
        <div className="text-xl font-extrabold tracking-wide text-lime-300">{banner.title}</div>
        <div className="text-xs text-neutral-300">{banner.subtitle}</div>
      </div>

      {tab === "create" && (
        <div className={`grid gap-1 rounded-2xl bg-white/[0.03] p-1 ${SUBS[activeModel].length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {SUBS[activeModel].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              className={`rounded-xl py-2 text-sm ${s.id === activeSub ? "bg-white/10 font-semibold text-white" : "text-neutral-400 hover:text-white"}`}
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
          label={isGenjutsu ? (activeSub === "swap" ? "Add the video to edit" : "Add a reference video to extract motion") : "Source video"}
          hint={isGenjutsu ? "Video duration: up to 30 seconds" : undefined}
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
          title={isGenjutsu ? (activeSub === "swap" ? "Replacement objects" : "Character / style images") : undefined}
          refs={form.refs}
          limits={limits}
          onAdd={addRef}
          onRemove={removeRef}
          onTag={(tag) => {
            if (isGenjutsu) setPromptOn(true);
            insert(tag);
          }}
          onBusyChange={onBusy}
          onDuration={onDuration}
        />
      )}

      {isGenjutsu && (
        <div className={rowClass}>
          <span>Prompt</span>
          <Switch on={promptOn} onToggle={() => setPromptOn((v) => !v)} label="Use a prompt" />
        </div>
      )}
      {showPrompt && promptEditor}
      {missing.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-300">
          <AlertTriangle size={12} /> {missing.join(", ")} not found in your references
        </p>
      )}

      {tab === "create" ? (
        <PopoverSelect label="Model" value={model} options={MODEL_OPTIONS} onChange={changeModel} searchable width={340} />
      ) : (
        <div className="rounded-2xl bg-white/[0.03] px-3 py-2">
          <div className="text-xs text-neutral-400">Model</div>
          <div className="text-sm font-semibold">Seedance 2.5 Edit</div>
        </div>
      )}

      {/* Seedance shows resolution as a chip; Genjutsu and Kling tiers get a Quality row, like Higgsfield */}
      {spec.model === "kling" && <PopoverSelect label="Quality" value={tier} options={KLING_TIER_OPTIONS} onChange={setTier} width={220} />}
      {spec.model === "genjutsu" && (
        <PopoverSelect label="Quality" value={form.resolution} options={qualityOptions} onChange={(r) => set("resolution", r)} width={220} />
      )}

      {(duration !== null || spec.aspectRatios || spec.model === "seedance") && (
        <div className="flex gap-2">
          {duration !== null && (
            <DurationPicker value={duration} min={spec.duration!.min} max={spec.duration!.max} onChange={(s) => set("duration", s)} icon={<Clock size={14} />} />
          )}
          {spec.aspectRatios && aspect && (
            <PopoverSelect
              variant="chip"
              label="Aspect ratio"
              icon={<RectangleHorizontal size={14} />}
              value={aspect}
              options={spec.aspectRatios.map((r) => ({ value: r, label: r, icon: <RatioIcon ratio={r} /> }))}
              onChange={(r) => set("aspect_ratio", r)}
              width={200}
            />
          )}
          {spec.model === "seedance" && (
            <PopoverSelect
              variant="chip"
              label="Resolution"
              icon={<Gem size={14} />}
              value={form.resolution}
              options={qualityOptions}
              onChange={(r) => set("resolution", r)}
              width={200}
            />
          )}
        </div>
      )}

      {spec.bitrate && (
        <PopoverSelect
          variant="inline"
          label="Bitrate"
          icon={<Gauge size={16} />}
          value={form.bitrate_mode}
          options={BITRATE_OPTIONS}
          onChange={(b) => set("bitrate_mode", b)}
          width={320}
        />
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
