"use client";

import { Check, ChevronRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PopoverOption<T extends string> {
  value: T;
  label: string;
  badge?: "TOP" | "NEW";
  meta?: string[];
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: PopoverOption<T>[];
  onChange: (value: T) => void;
  searchable?: boolean;
  width?: number;
}

const BADGE_CLASS = { TOP: "bg-blue-500 text-white", NEW: "bg-[#d7ff3a] text-black" } as const;

function Badge({ badge }: { badge?: "TOP" | "NEW" }) {
  if (!badge) return null;
  return <span className={`rounded px-1 text-[10px] font-bold italic ${BADGE_CLASS[badge]}`}>{badge}</span>;
}

/** A settings row that opens a floating option list beside it, like Higgsfield's model and quality pickers. */
export function PopoverSelect<T extends string>({ label, value, options, onChange, searchable, width = 320 }: Props<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value) ?? options[0];
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  function open() {
    const r = triggerRef.current!.getBoundingClientRect();
    // beside the row when there is room, otherwise below it
    const beside = r.right + 8 + width <= window.innerWidth;
    setPos({
      left: beside ? r.right + 8 : Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: beside ? Math.max(8, Math.min(r.top, window.innerHeight - 420)) : r.bottom + 4,
    });
    setQuery("");
  }

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (pos ? setPos(null) : open())}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]"
        aria-haspopup="listbox"
        aria-expanded={!!pos}
      >
        <span>
          <span className="block text-xs text-neutral-400">{label}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {current.label} <Badge badge={current.badge} />
          </span>
        </span>
        <ChevronRight size={16} className="text-neutral-400" />
      </button>
      {pos && (
        <div
          ref={panelRef}
          role="listbox"
          style={{ top: pos.top, left: pos.left, width }}
          className="fixed z-40 max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c1f] p-2 shadow-2xl"
        >
          {searchable && (
            <label className="mb-2 flex items-center gap-2 border-b border-white/5 px-2 pb-2 text-sm text-neutral-400">
              <Search size={15} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-white outline-none placeholder:text-neutral-500" />
            </label>
          )}
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setPos(null);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5 ${o.value === value ? "bg-white/[0.06]" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {o.label} <Badge badge={o.badge} />
                </span>
                {o.meta && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {o.meta.map((m) => (
                      <span key={m} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">
                        {m}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {o.value === value && <Check size={16} className="shrink-0 text-lime-300" />}
            </button>
          ))}
          {shown.length === 0 && <p className="px-3 py-4 text-sm text-neutral-500">No models match.</p>}
        </div>
      )}
    </>
  );
}
