"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MediaThumb } from "./MediaThumb";
import { splitByTags, type RefItem } from "@/lib/tags";

export interface InsertRequest {
  text: string;
  nonce: number;
  /** open the @ menu after inserting (used by the "@ Elements" button) */
  openMenu?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  tags: (RefItem & { tag: string })[];
  /** set by the parent (a reference click or the Elements button) to insert text at the caret */
  insertRequest: InsertRequest | null;
  placeholder?: string;
  footer?: ReactNode;
}

// Text and caret live in a transparent textarea; a mirrored layer behind it paints the tags.
const TEXT_LAYOUT = "whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6";

/** "@Video1" -> "Video 1" */
const menuLabel = (tag: string) => tag.slice(1).replace(/(\d+)$/, " $1");

export function PromptEditor({ value, onChange, tags, insertRequest, placeholder, footer }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const caret = useRef(value.length);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const known = new Set(tags.map((t) => t.tag));
  const suggestions = menu ? tags.filter((t) => t.tag.slice(1).toLowerCase().startsWith(menu.query)) : [];

  function trackCaret(el: HTMLTextAreaElement) {
    caret.current = el.selectionStart;
    const match = /@(\w*)$/.exec(el.value.slice(0, el.selectionStart));
    setMenu(match && tags.length > 0 ? { query: match[1].toLowerCase(), start: el.selectionStart - match[0].length } : null);
    setActive(0);
  }

  function replaceRange(text: string, start: number, end: number, reopen = false) {
    const next = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    onChange(next);
    setMenu(null);
    caret.current = pos;
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      if (reopen) trackCaret(el);
    });
  }

  function pick(tag: string) {
    if (menu) replaceRange(`${tag} `, menu.start, caret.current);
  }

  useEffect(() => {
    if (!insertRequest) return;
    const pos = Math.min(caret.current, value.length);
    const before = value.slice(0, pos);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const tail = insertRequest.openMenu ? "" : " ";
    replaceRange(`${lead}${insertRequest.text}${tail}`, pos, pos, insertRequest.openMenu);
    // only react to new insert requests
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.nonce]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03]">
      <div className="px-3 pt-2 text-xs text-neutral-400">Prompt</div>
      <div className="relative">
        <div ref={mirrorRef} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${TEXT_LAYOUT}`}>
          {splitByTags(value).map((part, i) =>
            part.tag ? (
              <span key={i} className={`rounded ${known.has(part.text) ? "bg-lime-300/15 text-lime-300" : "bg-red-500/15 text-red-300"}`}>
                {part.text}
              </span>
            ) : (
              <span key={i} className="text-neutral-100">
                {part.text}
              </span>
            ),
          )}
          {"\n"}
        </div>
        <textarea
          ref={areaRef}
          value={value}
          rows={6}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            trackCaret(e.target);
          }}
          onSelect={(e) => trackCaret(e.currentTarget)}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          onKeyDown={(e) => {
            if (!menu || suggestions.length === 0) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(suggestions[Math.min(active, suggestions.length - 1)].tag);
            } else if (e.key === "Escape") {
              setMenu(null);
            }
          }}
          className={`relative block w-full resize-none bg-transparent text-transparent caret-white outline-none placeholder:text-neutral-500 ${TEXT_LAYOUT}`}
        />
        {menu && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-2 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c1f] p-1.5 shadow-2xl"
          >
            {suggestions.map((s, i) => (
              <li key={s.tag} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s.tag);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${i === active ? "bg-white/10" : ""}`}
                >
                  <MediaThumb kind={s.kind} url={s.url} className="h-10 w-10" />
                  <span className="text-sm font-semibold text-white">{menuLabel(s.tag)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer && <div className="flex items-center gap-2 px-3 pb-2">{footer}</div>}
    </div>
  );
}
