"use client";

import { Film, ImageIcon, Loader2, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { Lightbox } from "./Lightbox";
import { MediaThumb } from "./MediaThumb";
import { useTrimmer } from "./TrimDialog";
import type { MediaKind } from "@/lib/modes";
import { acceptFor, uploadMedia } from "@/lib/upload-client";

interface Props {
  label: string;
  kind: Extract<MediaKind, "image" | "video">;
  value?: string;
  required?: boolean;
  onChange: (url: string | undefined) => void;
  onBusyChange: (delta: number) => void;
  onDuration: (url: string, seconds: number) => void;
}

/** A single upload slot: start frame, end frame or source video. Videos can be trimmed before upload. */
export function MediaSlot({ label, kind, value, required, onChange, onBusyChange, onDuration }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [trimDialog, trim] = useTrimmer();
  const Icon = kind === "image" ? ImageIcon : Film;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const choice = kind === "video" ? await trim(file) : "full";
    if (!choice) return;
    setBusy(true);
    onBusyChange(1);
    try {
      onChange(await uploadMedia(file, choice === "full" ? undefined : choice));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      onBusyChange(-1);
    }
  }

  return (
    <div className="flex-1">
      {value ? (
        <div className="group relative h-28">
          <button type="button" onClick={() => setPreviewing(true)} className="h-full w-full" title="Preview">
            <MediaThumb kind={kind} url={value} className="h-28 w-full" onDuration={onDuration} />
            <span className="absolute right-8 top-1 hidden rounded-full bg-black/70 p-1 text-neutral-300 group-hover:block">
              <Maximize2 size={12} />
            </span>
          </button>
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/75 px-1.5 text-[11px] text-neutral-200">{label}</span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-neutral-300 hover:text-white"
            aria-label={`Remove ${label}`}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 text-xs text-neutral-400 hover:border-white/40 hover:text-white">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
          <span>
            {busy && kind === "video" ? "Uploading…" : label}
            {required && !busy && <span className="text-red-400"> *</span>}
          </span>
          <input
            type="file"
            className="hidden"
            accept={acceptFor([kind])}
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <Lightbox item={previewing && value ? { kind, url: value, label } : null} onClose={() => setPreviewing(false)} />
      {trimDialog}
    </div>
  );
}
