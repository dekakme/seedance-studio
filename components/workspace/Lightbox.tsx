"use client";

import { Music, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { MediaKind } from "@/lib/modes";

export interface PreviewItem {
  kind: MediaKind;
  url: string;
  label?: string;
}

/** Full-screen preview of an image, video or audio reference. Esc or a backdrop click closes it. */
export function Lightbox({ item, onClose, actions }: { item: PreviewItem | null; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-full items-center justify-between gap-4 text-sm">
          <span className="font-semibold text-lime-300">{item.label}</span>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-full bg-white/10 p-1.5 text-neutral-200 hover:bg-white/20">
            <X size={16} />
          </button>
        </div>
        {item.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- remote Higgsfield CDN URLs, no optimization needed
          <img src={item.url} alt={item.label ?? ""} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
        )}
        {item.kind === "video" && <video src={item.url} controls autoPlay playsInline className="max-h-[75vh] max-w-full rounded-xl bg-black" />}
        {item.kind === "audio" && (
          <div className="flex w-96 max-w-full flex-col items-center gap-4 rounded-2xl bg-neutral-900 p-8">
            <Music size={40} className="text-neutral-400" />
            <audio src={item.url} controls autoPlay className="w-full" />
          </div>
        )}
        {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export const lightboxButton = "rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20";
