// Server-side access to the synced model catalog and JSON-schema validation of catalog job inputs.
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import catalogJson from "./catalog.json";
import { describeFields, type CatalogEntry } from "./catalog";
import type { ParseResult } from "./schemas";

// the inferred JSON type is a union of every schema shape; the synced file is known to match CatalogEntry
export const CATALOG = catalogJson as unknown as CatalogEntry[];
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();

function validatorFor(entry: CatalogEntry): ValidateFunction {
  let validate = validators.get(entry.id);
  if (!validate) {
    validate = ajv.compile(entry.schema);
    validators.set(entry.id, validate);
  }
  return validate;
}

/** Validates against the model's published JSON schema; media URLs must also be https. */
export function validateCatalogInput(entry: CatalogEntry, input: unknown): ParseResult {
  const payload = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const validate = validatorFor(entry);
  const errors: { path: string; message: string }[] = [];

  if (!validate(payload)) {
    for (const e of validate.errors ?? []) {
      // if/then/else failures repeat the underlying "required" errors; skip the wrapper noise
      if (e.keyword === "if") continue;
      const path =
        e.keyword === "required"
          ? String(e.params.missingProperty)
          : e.keyword === "additionalProperties"
            ? String(e.params.additionalProperty)
            : e.instancePath.replace(/^\//, "").replace(/\//g, ".");
      const message = e.keyword === "required" ? "Required" : e.keyword === "additionalProperties" ? "Not supported by this model" : (e.message ?? "Invalid");
      if (!errors.some((x) => x.path === path && x.message === message)) errors.push({ path, message });
    }
  }

  // not every published schema sets additionalProperties: false, so enforce it for all models
  const known = new Set(Object.keys(entry.schema.properties ?? {}));
  for (const key of Object.keys(payload)) {
    if (!known.has(key) && !errors.some((x) => x.path === key)) errors.push({ path: key, message: "Not supported by this model" });
  }

  for (const f of describeFields(entry.schema)) {
    if (f.kind !== "media" && f.kind !== "mediaList") continue;
    const values = ([] as unknown[]).concat(payload[f.name] ?? []);
    if (values.some((v) => typeof v === "string" && !v.startsWith("https://"))) {
      errors.push({ path: f.name, message: "Must be an https URL" });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, payload };
}
