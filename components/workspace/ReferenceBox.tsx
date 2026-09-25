"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Lightbox, lightboxButton, type PreviewItem } from "./Lightbox";
import { MediaThumb } from "./MediaThumb";
import { useTrimmer } from "./TrimDialog";
import type { MediaKind } from "@/lib/modes";
import { refTags, type RefItem } from "@/lib/tags";
import { acceptFor, kindOf, uploadMedia } from "@/lib/upload-client";

const KIND_LABEL: Record<MediaKind, string> = { image: "Images", video: "Videos", audio: "Audio" };

interface Props {
  title?: string;
  refs: RefItem[];
  limits: Partial<Record<MediaKind, number>>;
  onAdd: (item: RefItem) => void;
  onRemove: (index: number) => void;
  onTag: (tag: string) => void;
  onBusyChange: (delta: number) => void;
  onDuration: (url: string, seconds: number) => void;
}

export function ReferenceBox({ title, refs, limits, onAdd, onRemove, onTag, onBusyChange, onDuration }: Props) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(PreviewItem & { index: number }) | null>(null);
  const [trimDialog, trim] = useTrimmer();
  const kinds = Object.keys(limits) as MediaKind[];
  const count = (kind: MediaKind) => refs.filter((r) => r.kind === kind).length;
  const tagged = refTags(refs);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added: Record<string, number> = {};
    const queue: { file: File; kind: MediaKind }[] = [];
    for (const file of Array.from(files)) {
      const kind = kindOf(file.type);
      if (!kind || !(kind in limits)) {
        setError(`${file.name}: unsupported file type`);
        continue;
      }
      if (count(kind) + (added[kind] ?? 0) >= limits[kind]!) {
        setError(`At most ${limits[kind]} ${KIND_LABEL[kind].toLowerCase()}`);
        continue;
      }
      added[kind] = (added[kind] ?? 0) + 1;
      queue.push({ file, kind });
    }
    for (const { file, kind } of queue) {
      // videos go through the trim dialog first; cancelling skips that file
      const choice = kind === "video" ? await trim(file) : "full";
      if (!choice) continue;
      setPending((n) => n + 1);
      onBusyChange(1);
      try {
        onAdd({ kind, url: await uploadMedia(file, choice === "full" ? undefined : choice) });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPending((n) => n - 1);
        onBusyChange(-1);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
      {title && <div className="mb-2 text-xs text-neutral-400">{title}</div>}
      <div className="grid grid-cols-5 gap-2">
        <label
          className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 text-neutral-400 hover:border-white/40 hover:text-white"
          title="Add images, videos or audio"
        >
          <Plus size={18} />
          <input
            type="file"
            multiple
            className="hidden"
            accept={acceptFor(kinds)}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {tagged.map((ref, i) => (
          <div key={`${ref.url}-${i}`} className="group relative aspect-square">
            <button
              type="button"
              onClick={() => setPreview({ kind: ref.kind, url: ref.url, label: ref.tag, index: i })}
              className="h-full w-full"
              title="Preview"
            >
              <MediaThumb kind={ref.kind} url={ref.url} className="h-full w-full" onDuration={onDuration} />
            </button>
            <button
              type="button"
              onClick={() => onTag(ref.tag)}
              className="absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 text-[10px] font-medium text-lime-300 hover:bg-lime-300 hover:text-black"
              title={`Insert ${ref.tag} into the prompt`}
            >
              {ref.tag.slice(1)}
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-neutral-800 p-0.5 text-neutral-300 hover:text-white group-hover:block"
              aria-label={`Remove ${ref.tag}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {Array.from({ length: pending }, (_, i) => (
          <div key={`pending-${i}`} className="flex aspect-square items-center justify-center rounded-lg bg-white/5 text-neutral-400">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        {kinds.map((k) => `${KIND_LABEL[k]} ${count(k)}/${limits[k]}`).join(" · ")}
        {refs.length > 0 && " — click to preview, click the label to tag it"}
      </p>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      <Lightbox
        item={preview}
        onClose={() => setPreview(null)}
        actions={
          preview && (
            <>
              <button
                type="button"
                className={lightboxButton}
                onClick={() => {
                  onTag(preview.label!);
                  setPreview(null);
                }}
              >
                Insert {preview.label} into prompt
              </button>
              <button
                type="button"
                className={`${lightboxButton} text-red-300`}
                onClick={() => {
                  onRemove(preview.index);
                  setPreview(null);
                }}
              >
                Remove
              </button>
            </>
          )
        }
      />
      {trimDialog}
    </div>
  );
}
