// Generic support for every Higgsfield video model in lib/catalog.json (built by scripts/sync-catalog.ts).
// This file is client-safe: it never imports the catalog itself, it works on entries passed in.
import type { MediaKind } from "./modes";
import type { RefItem } from "./tags";

export interface CatalogEntry {
  /** model id, also the API path: POST https://api.higgsfield.ai/<id> */
  id: string;
  family: string;
  name: string;
  workflow: string;
  category: string;
  description: string;
  pricing: string;
  schema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProp>;
  [key: string]: unknown;
}

interface JsonSchemaProp {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  items?: { type?: string; format?: string };
}

/** Small id -> names map the history needs to label catalog jobs without loading every schema. */
export type CatalogLabels = Record<string, { family: string; workflow: string }>;

/** Job modes for catalog models are "catalog:<model id>". */
export type CatalogMode = `catalog:${string}`;
export const CATALOG_PREFIX = "catalog:";

export function isCatalogMode(value: unknown): value is CatalogMode {
  return typeof value === "string" && value.startsWith(CATALOG_PREFIX) && value.length > CATALOG_PREFIX.length;
}

export function catalogIdOf(mode: CatalogMode): string {
  return mode.slice(CATALOG_PREFIX.length);
}

export type FieldKind = "prompt" | "text" | "media" | "mediaList" | "url" | "enum" | "duration" | "number" | "boolean";

export interface FieldSpec {
  name: string;
  title: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  mediaKind?: MediaKind;
  options?: (string | number)[];
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
}

// multi-shot storyboards and saved Kling "elements" need dedicated UI; the model uses its defaults
const SKIPPED = new Set(["multi_shots", "multi_prompt", "elements"]);

function mediaKindOf(name: string): MediaKind | undefined {
  if (/video/.test(name)) return "video";
  if (/audio/.test(name)) return "audio";
  if (/image|frame/.test(name)) return "image";
  return undefined;
}

const humanize = (name: string) => name.replace(/_/g, " ").replace(/\burl(s)?\b/, "").trim().replace(/^\w/, (c) => c.toUpperCase());

/** Turns a model's JSON schema into form fields. Unsupported shapes are left out (their defaults apply). */
export function describeFields(schema: JsonSchema): FieldSpec[] {
  const required = new Set(schema.required ?? []);
  const fields: FieldSpec[] = [];
  for (const [name, p] of Object.entries(schema.properties ?? {})) {
    if (SKIPPED.has(name)) continue;
    const base = { name, title: p.title ?? humanize(name), description: p.description, required: required.has(name), default: p.default };
    if (p.enum) {
      fields.push({ ...base, kind: "enum", options: p.enum });
    } else if (p.type === "string" && p.format === "uri") {
      const mediaKind = mediaKindOf(name);
      fields.push(mediaKind ? { ...base, kind: "media", mediaKind } : { ...base, kind: "url" });
    } else if (p.type === "string") {
      fields.push({ ...base, kind: name === "prompt" ? "prompt" : "text" });
    } else if (p.type === "array" && p.items?.format === "uri") {
      const mediaKind = mediaKindOf(name);
      if (mediaKind) fields.push({ ...base, kind: "mediaList", mediaKind, min: p.minItems, max: p.maxItems ?? 10 });
    } else if (p.type === "integer" || p.type === "number") {
      const range = { min: p.minimum, max: p.maximum, step: p.multipleOf ?? (p.type === "integer" ? 1 : undefined) };
      fields.push({ ...base, ...range, kind: name === "duration" && p.minimum !== undefined && p.maximum !== undefined ? "duration" : "number" });
    } else if (p.type === "boolean") {
      fields.push({ ...base, kind: "boolean" });
    }
  }
  return fields;
}

export function initialValues(fields: FieldSpec[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => f.default !== undefined && f.kind !== "mediaList").map((f) => [f.name, f.default]));
}

/** Max references per kind, from the model's list fields (image_urls, video_urls, audio_urls). */
export function catalogRefLimits(fields: FieldSpec[]): Partial<Record<MediaKind, number>> {
  const limits: Partial<Record<MediaKind, number>> = {};
  for (const f of fields) if (f.kind === "mediaList" && f.mediaKind) limits[f.mediaKind] = f.max;
  return limits;
}

/** Builds the request body: set values only, with references split into their list fields. */
export function buildCatalogInput(fields: FieldSpec[], values: Record<string, unknown>, refs: RefItem[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "mediaList") {
      const urls = refs.filter((r) => r.kind === f.mediaKind).map((r) => r.url);
      if (urls.length > 0) input[f.name] = urls;
      continue;
    }
    let v = values[f.name];
    if (typeof v === "string") v = v.trim();
    if (v === undefined || v === null || v === "") continue;
    input[f.name] = v;
  }
  return input;
}
