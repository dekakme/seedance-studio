"use client";

import { AlertTriangle, AtSign, Clock, Gem, Hash, Loader2, RectangleHorizontal, SlidersHorizontal, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { RatioIcon, Switch } from "./controls";
import { MediaSlot } from "./MediaSlot";
import { DurationPicker, PopoverSelect, type PopoverOption } from "./Popover";
import { PromptEditor, type InsertRequest } from "./PromptEditor";
import { ReferenceBox } from "./ReferenceBox";
import { buildCatalogInput, catalogRefLimits, describeFields, initialValues, type CatalogEntry, type FieldSpec } from "@/lib/catalog";
import { refTags, removeRefFromPrompt, unknownTags, type RefItem } from "@/lib/tags";
import type { Job } from "@/lib/types";

// enums shown as compact chips next to duration, like the curated models
const CHIP_FIELDS = new Set(["duration", "aspect_ratio", "resolution"]);
const rowClass = "flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm font-medium";
const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-white/25";

const cleanTitle = (f: FieldSpec) => f.title.replace(/\s*URLs?$/i, "");

interface Props {
  entry: CatalogEntry;
  preset?: { values: Record<string, unknown>; refs: RefItem[] };
  /** tabs + banner, rendered by the composer */
  header: ReactNode;
  /** the model picker, so the user can switch models from here */
  modelPicker: ReactNode;
  onCreated: (job: Job) => void;
}

/** A form generated from any catalog model's JSON schema. */
export function CatalogForm({ entry, preset, header, modelPicker, onCreated }: Props) {
  const router = useRouter();
  const fields = useMemo(() => describeFields(entry.schema), [entry]);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initialValues(fields), ...preset?.values }));
  const [refs, setRefs] = useState<RefItem[]>(preset?.refs ?? []);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // one token per intended generation, so a retried submit is not billed twice
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);

  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));
  const onBusy = (d: number) => setUploading((n) => n + d);
  const ignoreDuration = () => {};
  const limits = catalogRefLimits(fields);
  const hasRefs = Object.keys(limits).length > 0;
  const tags = hasRefs ? refTags(refs) : [];
  const prompt = typeof values.prompt === "string" ? values.prompt : "";
  const missing = unknownTags(prompt, refs);

  const promptField = fields.find((f) => f.kind === "prompt");
  const mediaFields = fields.filter((f) => f.kind === "media");
  const chipFields = fields.filter((f) => (f.kind === "duration" || f.kind === "enum") && CHIP_FIELDS.has(f.name));
  const enumRows = fields.filter((f) => f.kind === "enum" && !CHIP_FIELDS.has(f.name));

  // enums without a schema default get a "Default" choice that leaves the field unset
  const optionsFor = (f: FieldSpec): PopoverOption<string>[] => [
    ...(f.default === undefined ? [{ value: "", label: "Default" }] : []),
    ...f.options!.map((o) => ({
      value: String(o),
      label: f.name === "duration" ? `${o}s` : String(o),
      icon: f.name === "aspect_ratio" ? <RatioIcon ratio={String(o)} /> : undefined,
    })),
  ];
  const enumValue = (f: FieldSpec) => (values[f.name] === undefined ? "" : String(values[f.name]));
  const setEnum = (f: FieldSpec) => (s: string) => set(f.name, s === "" ? undefined : f.options!.find((o) => String(o) === s));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: `catalog:${entry.id}`, input: buildCatalogInput(fields, values, refs), client_token: clientToken }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { job?: Job; error?: string; errors?: { path: string; message: string }[] };
      if (body.job) {
        setClientToken(crypto.randomUUID());
        onCreated(body.job);
      }
      if (!res.ok) {
        setErrors(body.errors?.map((x) => `${x.path || "input"}: ${x.message}`) ?? [body.error ?? `Request failed (${res.status})`]);
      }
    } catch {
      setErrors(["Network error, try again"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {header}

      {mediaFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {mediaFields.map((f) => (
            <div key={f.name} className={f.mediaKind === "image" ? "" : "col-span-2"}>
              <MediaSlot
                label={cleanTitle(f)}
                kind={f.mediaKind!}
                required={f.required}
                value={typeof values[f.name] === "string" ? (values[f.name] as string) : undefined}
                onChange={(url) => set(f.name, url)}
                onBusyChange={onBusy}
                onDuration={ignoreDuration}
              />
            </div>
          ))}
        </div>
      )}

      {hasRefs && (
        <ReferenceBox
          refs={refs}
          limits={limits}
          onAdd={(item) => setRefs((r) => [...r, item])}
          onRemove={(i) => {
            setValues((v) => ({ ...v, prompt: removeRefFromPrompt(typeof v.prompt === "string" ? v.prompt : "", refs, i) }));
            setRefs((r) => r.filter((_, j) => j !== i));
          }}
          onTag={(tag) => setInsertRequest({ text: tag, nonce: Date.now() })}
          onBusyChange={onBusy}
          onDuration={ignoreDuration}
        />
      )}

      {promptField && (
        <PromptEditor
          value={prompt}
          onChange={(v) => set("prompt", v)}
          tags={tags}
          insertRequest={insertRequest}
          placeholder={promptField.required ? "Describe the scene…" : "Optional: describe the scene…"}
          footer={
            tags.length > 0 ? (
              <button
                type="button"
                onClick={() => setInsertRequest({ text: "@", openMenu: true, nonce: Date.now() })}
                className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium hover:bg-white/10"
              >
                <AtSign size={13} /> Elements
              </button>
            ) : undefined
          }
        />
      )}
      {missing.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-300">
          <AlertTriangle size={12} /> {missing.join(", ")} not found in your references
        </p>
      )}

      {fields
        .filter((f) => f.kind === "text")
        .map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-neutral-400">
            {f.title}
            <textarea rows={2} value={typeof values[f.name] === "string" ? (values[f.name] as string) : ""} onChange={(e) => set(f.name, e.target.value)} className={inputClass} />
          </label>
        ))}
      {fields
        .filter((f) => f.kind === "url")
        .map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-neutral-400">
            {cleanTitle(f)}
            <input type="url" placeholder="https://…" value={typeof values[f.name] === "string" ? (values[f.name] as string) : ""} onChange={(e) => set(f.name, e.target.value)} className={inputClass} />
            {f.description && <span className="text-[11px] text-neutral-500">{f.description}</span>}
          </label>
        ))}

      {modelPicker}

      {chipFields.length > 0 && (
        <div className="flex gap-2">
          {chipFields.map((f) =>
            f.kind === "duration" ? (
              <DurationPicker
                key={f.name}
                value={typeof values[f.name] === "number" ? (values[f.name] as number) : (f.min ?? 5)}
                min={f.min!}
                max={f.max!}
                onChange={(s) => set(f.name, s)}
                icon={<Clock size={14} />}
              />
            ) : (
              <PopoverSelect
                key={f.name}
                variant="chip"
                label={f.title}
                icon={f.name === "duration" ? <Clock size={14} /> : f.name === "aspect_ratio" ? <RectangleHorizontal size={14} /> : <Gem size={14} />}
                value={enumValue(f)}
                options={optionsFor(f)}
                onChange={setEnum(f)}
                width={200}
              />
            ),
          )}
        </div>
      )}

      {enumRows.map((f) => (
        <PopoverSelect
          key={f.name}
          variant="inline"
          label={f.title}
          icon={<SlidersHorizontal size={16} />}
          value={enumValue(f)}
          options={optionsFor(f)}
          onChange={setEnum(f)}
          searchable={f.options!.length > 8}
          width={280}
        />
      ))}

      {fields
        .filter((f) => f.kind === "number")
        .map((f) =>
          f.min !== undefined && f.max !== undefined ? (
            <label key={f.name} className={rowClass} title={f.description}>
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-neutral-400" /> {f.title}
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? (f.max - f.min) / 100}
                  value={typeof values[f.name] === "number" ? (values[f.name] as number) : f.min}
                  onChange={(e) => set(f.name, Number(e.target.value))}
                  className="w-28 accent-lime-300"
                />
                <span className="w-10 text-right font-semibold text-lime-300">{typeof values[f.name] === "number" ? String(values[f.name]) : "–"}</span>
              </span>
            </label>
          ) : (
            <label key={f.name} className={rowClass} title={f.description}>
              <span className="flex items-center gap-2">
                <Hash size={16} className="text-neutral-400" /> {f.title}
              </span>
              <input
                type="number"
                step={f.step ?? "any"}
                placeholder="Random"
                value={typeof values[f.name] === "number" ? (values[f.name] as number) : ""}
                onChange={(e) => set(f.name, e.target.value === "" ? undefined : Number(e.target.value))}
                className="w-28 rounded-lg bg-white/5 px-2 py-1 text-right outline-none"
              />
            </label>
          ),
        )}

      {fields
        .filter((f) => f.kind === "boolean")
        .map((f) => (
          <div key={f.name} className={rowClass} title={f.description}>
            <span>{f.title}</span>
            <Switch on={values[f.name] === true} onToggle={() => set(f.name, values[f.name] !== true)} label={f.title} />
          </div>
        ))}

      {errors.length > 0 && (
        <ul className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        disabled={busy || uploading > 0}
        className="flex items-center justify-center gap-2 rounded-2xl bg-[#d7ff3a] py-3.5 text-base font-semibold text-black shadow-[0_0_24px_rgba(215,255,58,0.2)] hover:bg-[#cbf22e] disabled:opacity-50"
      >
        {uploading > 0 ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Uploading…
          </>
        ) : busy ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Submitting…
          </>
        ) : (
          <>
            <Sparkles size={16} /> Generate
          </>
        )}
      </button>
      <p className="text-center text-[11px] leading-4 text-neutral-500">{entry.pricing || "No public pricing for this model."}</p>
    </form>
  );
}
