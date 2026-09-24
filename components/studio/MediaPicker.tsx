"use client";

import { useState } from "react";
import { UPLOAD_TYPES, type MediaKind } from "@/lib/modes";

interface Props {
  label: string;
  kind: MediaKind;
  max: number;
  required?: boolean;
  value: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  /** +n when uploads start, -1 as each finishes */
  onBusyChange: (delta: number) => void;
}

async function uploadFile(file: File): Promise<string> {
  const data = new FormData();
  data.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: data });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.url;
}

function Preview({ kind, url }: { kind: MediaKind; url: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote Higgsfield CDN URLs, no optimization needed
  if (kind === "image") return <img src={url} alt="" className="h-24 w-24 rounded object-cover" />;
  if (kind === "video") return <video src={url} muted className="h-24 w-32 rounded object-cover" />;
  return <audio src={url} controls className="w-56" />;
}

export function MediaPicker({ label, kind, max, required, value, onChange, onBusyChange }: Props) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const room = max - value.length - pending;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    setError(files.length > picked.length ? `At most ${max} file(s)` : null);
    setPending((n) => n + picked.length);
    onBusyChange(picked.length);
    for (const file of picked) {
      try {
        const url = await uploadFile(file);
        onChange((prev) => [...prev, url]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPending((n) => n - 1);
        onBusyChange(-1);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-neutral-300">
        {label}
        {required && <span className="text-red-400"> *</span>}
        {max > 1 && (
          <span className="text-neutral-500">
            {" "}
            ({value.length}/{max})
          </span>
        )}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {value.map((url) => (
          <div key={url} className="relative">
            <Preview kind={kind} url={url} />
            <button
              type="button"
              onClick={() => onChange((prev) => prev.filter((u) => u !== url))}
              className="absolute -right-2 -top-2 rounded-full bg-neutral-800 px-2 text-xs"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {pending > 0 && <span className="text-sm text-neutral-400">Uploading {pending}…</span>}
        {room > 0 && (
          <label className="cursor-pointer rounded-lg border border-dashed border-neutral-600 px-4 py-3 text-sm text-neutral-400 hover:border-neutral-400">
            + Add {kind}
            <input
              type="file"
              className="hidden"
              accept={UPLOAD_TYPES[kind].join(",")}
              multiple={max > 1}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
