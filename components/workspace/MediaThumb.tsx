"use client";

import { Music } from "lucide-react";
import type { MediaKind } from "@/lib/modes";

interface Props {
  kind: MediaKind;
  url: string;
  className?: string;
  /** reports a video's length in seconds once its metadata loads */
  onDuration?: (url: string, seconds: number) => void;
}

export function MediaThumb({ kind, url, className = "h-14 w-14", onDuration }: Props) {
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- remote Higgsfield CDN URLs, no optimization needed
    return <img src={url} alt="" className={`${className} rounded-lg object-cover`} />;
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => onDuration?.(url, e.currentTarget.duration)}
        className={`${className} rounded-lg bg-black object-cover`}
      />
    );
  }
  return (
    <div className={`${className} flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-300`}>
      <Music size={18} />
    </div>
  );
}
