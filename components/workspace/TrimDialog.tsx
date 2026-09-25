"use client";

import { Play, Scissors } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** A range to cut, "full" to upload the whole video, or null when the user cancelled. */
export type TrimChoice = { start: number; end: number } | "full" | null;

const MIN_SECONDS = 1;

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function TrimDialog({ file, onDone }: { file: File; onDone: (choice: TrimChoice) => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewEnd = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [current, setCurrent] = useState(0);

  // revoke on close rather than in an effect cleanup: StrictMode re-runs effects and would revoke a live URL
  const finish = useCallback(
    (choice: TrimChoice) => {
      URL.revokeObjectURL(url);
      onDone(choice);
    },
    [url, onDone],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };
  const changeStart = (t: number) => {
    const next = Math.max(0, Math.min(t, end - MIN_SECONDS));
    setStart(next);
    seek(next);
  };
  const changeEnd = (t: number) => {
    const next = Math.min(duration, Math.max(t, start + MIN_SECONDS));
    setEnd(next);
    seek(next);
  };
  const playSelection = () => {
    const v = videoRef.current;
    if (!v) return;
    previewEnd.current = end;
    v.currentTime = start;
    void v.play();
  };

  const ready = duration > 0;
  const isFull = ready && start <= 0.05 && end >= duration - 0.05;
  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-white/10 bg-[#141416] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Scissors size={16} className="text-lime-300" /> Trim video
          </div>
          <span className="truncate text-xs text-neutral-500">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
        </div>

        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          className="max-h-[50vh] w-full rounded-xl bg-black"
          onError={() => setFailed(true)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) {
              setDuration(d);
              setEnd(d);
            } else {
              setFailed(true);
            }
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrent(t);
            if (previewEnd.current !== null && t >= previewEnd.current) {
              e.currentTarget.pause();
              previewEnd.current = null;
            }
          }}
        />

        {ready ? (
          <>
            <div className="relative h-2 rounded-full bg-white/10">
              <div className="absolute inset-y-0 rounded-full bg-lime-300/60" style={{ left: `${pct(start)}%`, width: `${pct(end - start)}%` }} />
              <div className="absolute -top-1 h-4 w-0.5 bg-white" style={{ left: `${pct(current)}%` }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                <span className="flex justify-between">
                  Start <span className="font-mono text-neutral-200">{fmt(start)}</span>
                </span>
                <input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => changeStart(Number(e.target.value))} className="accent-lime-300" />
                <button type="button" onClick={() => changeStart(current)} className="self-start text-lime-300 hover:underline">
                  Set start at playhead
                </button>
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                <span className="flex justify-between">
                  End <span className="font-mono text-neutral-200">{fmt(end)}</span>
                </span>
                <input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => changeEnd(Number(e.target.value))} className="accent-lime-300" />
                <button type="button" onClick={() => changeEnd(current)} className="self-start text-lime-300 hover:underline">
                  Set end at playhead
                </button>
              </label>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span>
                Selected <strong className="text-lime-300">{fmt(end - start)}</strong>
                <span className="text-neutral-500"> of {fmt(duration)}</span>
              </span>
              <button type="button" onClick={playSelection} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 hover:bg-white/10">
                <Play size={14} /> Play selection
              </button>
            </div>
          </>
        ) : failed ? (
          <p className="text-sm text-neutral-400">This browser can&apos;t preview the file, so it can only be uploaded whole.</p>
        ) : (
          <p className="text-sm text-neutral-400">Loading video…</p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className="rounded-xl px-4 py-2 text-sm text-neutral-300 hover:bg-white/5">
            Cancel
          </button>
          <button type="button" onClick={() => finish("full")} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20">
            Use full video
          </button>
          <button
            type="button"
            disabled={!ready || isFull}
            onClick={() => finish({ start, end })}
            className="flex items-center gap-1.5 rounded-xl bg-[#d7ff3a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#cbf22e] disabled:opacity-40"
          >
            <Scissors size={14} /> Trim &amp; upload
          </button>
        </div>
      </div>
    </div>
  );
}

/** Returns the dialog element to render and an async `trim(file)` that resolves with the user's choice. */
export function useTrimmer(): [ReactNode, (file: File) => Promise<TrimChoice>] {
  const [pending, setPending] = useState<{ file: File; resolve: (choice: TrimChoice) => void } | null>(null);
  const trim = useCallback((file: File) => new Promise<TrimChoice>((resolve) => setPending({ file, resolve })), []);
  const onDone = useCallback(
    (choice: TrimChoice) => {
      pending?.resolve(choice);
      setPending(null);
    },
    [pending],
  );
  return [pending ? <TrimDialog key={pending.file.name + pending.file.size} file={pending.file} onDone={onDone} /> : null, trim];
}
