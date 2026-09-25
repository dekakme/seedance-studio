"use client";

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[#d7ff3a]" : "bg-white/15"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${on ? "left-[18px] bg-black" : "left-0.5 bg-white"}`} />
    </button>
  );
}

/** Small outline box drawn at the given aspect ratio, for aspect ratio lists. */
export function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  // "auto" / "adaptive": no fixed shape
  if (!w || !h) {
    return (
      <span className="flex h-4 w-4 items-center justify-center">
        <span className="h-3.5 w-3.5 rounded-[2px] border-[1.5px] border-dashed border-current" />
      </span>
    );
  }
  const scale = 16 / Math.max(w, h);
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(4, w * scale), height: Math.max(4, h * scale) }} />
    </span>
  );
}
