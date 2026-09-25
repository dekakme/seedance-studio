"use client";

import { Check, ChevronRight, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** "beside": to the right of the composer panel (rows). "above": over the trigger (chips). */
type Placement = "beside" | "above";

function usePopover(width: number, placement: Placement) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function open() {
    const r = triggerRef.current!.getBoundingClientRect();
    const clampLeft = (x: number) => Math.max(8, Math.min(x, window.innerWidth - width - 8));
    if (placement === "above") {
      setPos({ left: clampLeft(r.left), top: r.top });
      return;
    }
    // anchor just outside the composer panel (not over its scrollbar), top-aligned with the row
    const panelRight = triggerRef.current!.closest("aside")?.getBoundingClientRect().right ?? r.right;
    const beside = panelRight + 12 + width <= window.innerWidth;
    setPos({ left: beside ? panelRight + 12 : clampLeft(r.left), top: beside ? r.top : r.bottom + 4 });
  }

  // once rendered and measured, lift "above" panels over the trigger and keep every panel on screen
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!pos || !panel || !trigger) return;
    const h = panel.offsetHeight;
    let top = pos.top;
    if (placement === "above") {
      const r = trigger.getBoundingClientRect();
      top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    panel.style.top = `${top}px`;
  }, [pos, placement]);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // the panel is fixed-positioned, so scrolling the composer would leave it floating in the wrong place
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [pos]);

  return {
    triggerRef,
    panelRef,
    pos,
    close: () => setPos(null),
    toggle: () => (pos ? setPos(null) : open()),
  };
}

function Panel({
  pos,
  width,
  panelRef,
  children,
}: {
  pos: { top: number; left: number } | null;
  width: number;
  panelRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  if (!pos) return null;
  return (
    <div
      ref={panelRef}
      role="listbox"
      style={{ top: pos.top, left: pos.left, width }}
      className="fixed z-40 max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c1f] p-2 shadow-2xl"
    >
      {children}
    </div>
  );
}

export interface PopoverOption<T extends string> {
  value: T;
  label: string;
  badge?: "TOP" | "NEW";
  meta?: string[];
  description?: string;
  icon?: ReactNode;
  /** options with a group get a heading whenever the group changes */
  group?: string;
}

const BADGE_CLASS = { TOP: "bg-blue-500 text-white", NEW: "bg-[#d7ff3a] text-black" } as const;

function Badge({ badge }: { badge?: "TOP" | "NEW" }) {
  if (!badge) return null;
  return <span className={`rounded px-1 text-[10px] font-bold italic ${BADGE_CLASS[badge]}`}>{badge}</span>;
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: PopoverOption<T>[];
  onChange: (value: T) => void;
  /**
   * row: two-line settings row (Model, Quality); inline: one-line row with the value on the right (Bitrate);
   * chip: compact chip that opens above itself (aspect ratio, resolution)
   */
  variant?: "row" | "inline" | "chip";
  icon?: ReactNode;
  searchable?: boolean;
  width?: number;
}

export function PopoverSelect<T extends string>({ label, value, options, onChange, variant = "row", icon, searchable, width = 320 }: SelectProps<T>) {
  const { triggerRef, panelRef, pos, close, toggle } = usePopover(width, variant === "chip" ? "above" : "beside");
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value) ?? options[0];
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => `${o.group ?? ""} ${o.label} ${(o.meta ?? []).join(" ")}`.toLowerCase().includes(q));

  const trigger =
    variant === "chip" ? (
      <button
        ref={triggerRef}
        type="button"
        title={label}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${pos ? "bg-white/[0.12]" : "bg-white/[0.05] hover:bg-white/[0.08]"}`}
      >
        <span className="shrink-0 text-neutral-400">{icon}</span>
        <span className="truncate">{current.label}</span>
      </button>
    ) : variant === "inline" ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium hover:bg-white/[0.06]"
      >
        <span className="flex items-center gap-2">
          <span className="text-neutral-400">{icon}</span> {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-lg bg-lime-300/10 px-2 py-0.5 font-semibold text-lime-300">
            {current.icon} {current.label}
          </span>
          <ChevronRight size={16} className="text-neutral-400" />
        </span>
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]"
      >
        <span>
          <span className="block text-xs text-neutral-400">{label}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {current.label} <Badge badge={current.badge} />
          </span>
        </span>
        <ChevronRight size={16} className="text-neutral-400" />
      </button>
    );

  return (
    <>
      {trigger}
      <Panel pos={pos} width={width} panelRef={panelRef}>
        {searchable && (
          <label className="mb-2 flex items-center gap-2 border-b border-white/5 px-2 pb-2 text-sm text-neutral-400">
            <Search size={15} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-white outline-none placeholder:text-neutral-500" />
          </label>
        )}
        {shown.map((o, i) => (
          <div key={o.value}>
          {o.group && o.group !== shown[i - 1]?.group && (
            <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{o.group}</div>
          )}
          <button
            type="button"
            role="option"
            aria-selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setQuery("");
              close();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 ${o.value === value ? "bg-white/[0.07]" : ""}`}
          >
            {o.icon && <span className="shrink-0 text-neutral-300">{o.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                {o.label} <Badge badge={o.badge} />
              </span>
              {o.description && <span className="mt-0.5 block text-xs text-neutral-400">{o.description}</span>}
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
          </div>
        ))}
        {shown.length === 0 && <p className="px-3 py-4 text-sm text-neutral-500">No matches.</p>}
      </Panel>
    </>
  );
}

/** Duration chip with a "Choose duration" slider panel above it. */
export function DurationPicker({ value, min, max, onChange, icon }: { value: number; min: number; max: number; onChange: (s: number) => void; icon: ReactNode }) {
  const width = 300;
  const { triggerRef, panelRef, pos, toggle } = usePopover(width, "above");
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Duration"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={!!pos}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${pos ? "bg-white/[0.12]" : "bg-white/[0.05] hover:bg-white/[0.08]"}`}
      >
        <span className="shrink-0 text-neutral-400">{icon}</span>
        {value}s
      </button>
      <Panel pos={pos} width={width} panelRef={panelRef}>
        <div className="flex flex-col gap-3 p-2">
          <div className="text-sm font-semibold">Choose duration</div>
          <div className="relative h-10 overflow-hidden rounded-xl bg-white/[0.06]">
            <div className="absolute inset-y-0 left-0 bg-white/[0.08]" style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-1.5 w-1 rounded-full bg-white" style={{ left: `calc(${pct}% - ${pct > 98 ? 6 : 2}px)` }} />
            {/* keep the label clear of the handle when the value is small */}
            <span
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-semibold"
              style={{ left: pct < 20 ? `calc(${pct}% + 10px)` : "12px" }}
            >
              {value}s
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-label="Duration in seconds"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="flex justify-between text-[11px] text-neutral-500">
            <span>{min}s</span>
            <span>{max}s</span>
          </div>
        </div>
      </Panel>
    </>
  );
}
