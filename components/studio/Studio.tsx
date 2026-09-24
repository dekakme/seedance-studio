"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MediaPicker } from "./MediaPicker";
import {
  ASPECT_RATIOS,
  BITRATE_MODES,
  DURATION,
  FIELD_KIND,
  MODES,
  MODE_SPECS,
  OUTPUT_FORMATS,
  RESOLUTIONS,
  type Mode,
  type MultiField,
  type SingleField,
} from "@/lib/modes";
import { DEFAULT_FORM, buildInput, type FormState } from "@/lib/studio-input";

export interface StudioPrefill {
  mode?: Mode;
  prompt?: string;
  video_url?: string;
}

const FIELD_LABELS: Record<SingleField | MultiField, string> = {
  image_url: "Start image",
  end_image_url: "End image (optional)",
  video_url: "Source video",
  image_urls: "Reference images",
  video_urls: "Reference videos",
  audio_urls: "Reference audio",
};

const selectClass = "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm";

export function Studio({ prefill }: { prefill: StudioPrefill }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(prefill.mode ?? "text");
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    prompt: prefill.prompt ?? "",
    media: prefill.video_url ? { video_url: [prefill.video_url] } : {},
  });
  // one token per intended generation: a retry after a network error reuses it, so the server can dedupe
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const spec = MODE_SPECS[mode];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const mediaUpdater = (field: SingleField | MultiField) => (update: (prev: string[]) => string[]) =>
    setForm((f) => ({ ...f, media: { ...f.media, [field]: update(f.media[field] ?? []) } }));

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
        job?: { id: string };
        error?: string;
        errors?: { path: string; message: string }[];
      };
      // the server recorded a job for this token, so the next submit is a new generation
      if (body.job) setClientToken(crypto.randomUUID());
      if (!res.ok) {
        setErrors(body.errors?.map((x) => `${x.path || "input"}: ${x.message}`) ?? [body.error ?? `Request failed (${res.status})`]);
        return;
      }
      router.push(`/gallery#job-${body.job!.id}`);
    } catch {
      setErrors(["Network error, try again"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm ${m === mode ? "bg-white text-black" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          >
            {MODE_SPECS[m].label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-neutral-300">
          Prompt{spec.promptRequired ? <span className="text-red-400"> *</span> : " (optional)"}
        </span>
        <textarea
          value={form.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          rows={4}
          placeholder="Describe the shot, camera movement, mood…"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
      </label>

      {spec.single.map(({ field, required }) => (
        <MediaPicker
          key={`${mode}-${field}`}
          label={FIELD_LABELS[field]}
          kind={FIELD_KIND[field]}
          max={1}
          required={required}
          value={form.media[field] ?? []}
          onChange={mediaUpdater(field)}
          onBusyChange={(d) => setUploading((n) => n + d)}
        />
      ))}
      {(Object.entries(spec.multi) as [MultiField, number][]).map(([field, max]) => (
        <MediaPicker
          key={`${mode}-${field}`}
          label={FIELD_LABELS[field]}
          kind={FIELD_KIND[field]}
          max={max}
          value={form.media[field] ?? []}
          onChange={mediaUpdater(field)}
          onBusyChange={(d) => setUploading((n) => n + d)}
        />
      ))}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {spec.duration && (
          <label className="flex flex-col gap-1 text-sm">
            Duration: {form.duration}s
            <input
              type="range"
              min={DURATION.min}
              max={DURATION.max}
              value={form.duration}
              onChange={(e) => set("duration", Number(e.target.value))}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Resolution
          <select value={form.resolution} onChange={(e) => set("resolution", e.target.value)} className={selectClass}>
            {RESOLUTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {spec.aspectRatio && (
          <label className="flex flex-col gap-1 text-sm">
            Aspect ratio
            <select value={form.aspect_ratio} onChange={(e) => set("aspect_ratio", e.target.value)} className={selectClass}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Bitrate
          <select value={form.bitrate_mode} onChange={(e) => set("bitrate_mode", e.target.value)} className={selectClass}>
            {BITRATE_MODES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        {spec.outputFormat && (
          <label className="flex flex-col gap-1 text-sm">
            Format
            <select value={form.output_format} onChange={(e) => set("output_format", e.target.value)} className={selectClass}>
              {OUTPUT_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.generate_audio} onChange={(e) => set("generate_audio", e.target.checked)} />
          Generate audio
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        disabled={busy || uploading > 0}
        className="self-start rounded-lg bg-white px-6 py-2 font-medium text-black disabled:opacity-50"
      >
        {uploading > 0 ? "Waiting for uploads…" : busy ? "Submitting…" : "Generate"}
      </button>
    </form>
  );
}
