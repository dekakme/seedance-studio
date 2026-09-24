# Seedance Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password-protected Next.js app that generates Seedance 2.5 videos through the Higgsfield API in five modes and keeps them in a local gallery.

**Architecture:** Next.js 16 App Router. Route handlers talk to Higgsfield only through `lib/higgsfield.ts`. Jobs are stored in SQLite (`lib/db.ts`). The browser polls `/api/jobs/:id`, which refreshes status from Higgsfield and downloads finished videos to `storage/videos/`. A cookie session guarded by `proxy.ts` protects everything.

**Tech Stack:** Next.js 16.x, React 19, TypeScript, Tailwind CSS v4, better-sqlite3 13, Zod 4, Vitest 5, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-25-seedance-studio-design.md`

## Global Constraints

- Project root: `C:\laragon\www\seedance`. Run every command from there.
- Higgsfield base URL `https://api.higgsfield.ai`, auth header `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`. The key must never be sent to any other host and never reach the browser.
- Seedance 2.5 limits: duration 4–30 (default 5); resolution `480p|720p` (default `720p`); bitrate `standard|high` (default `high`); `generate_audio` default `true`; aspect ratios `16:9, 4:3, 1:1, 3:4, 9:16, 21:9` (default `16:9`); `output_format` `mp4|mov` (text only, default `mp4`); reference arrays images ≤30, videos ≤10, audio ≤10; edit/extend extra videos ≤9.
- Job statuses: `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`, plus local `error`.
- Env vars: `HF_API_KEY_ID`, `HF_API_KEY_SECRET`, `APP_PASSWORD`, `SESSION_SECRET` (≥32 chars); optional `DB_PATH`.
- Next.js 16: the auth guard file is `proxy.ts` exporting `proxy`; route `params` and page `searchParams` are Promises.
- Timestamps: ISO-8601 strings (`Date.toISOString()`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|------|----------------|
| `lib/env.ts` | `requireEnv(name)` |
| `lib/modes.ts` | Mode list, endpoint paths, per-mode field spec, enums, upload types (client-safe) |
| `lib/schemas.ts` | Zod validation → exact Higgsfield payload |
| `lib/higgsfield.ts` | Higgsfield HTTP client + error mapping |
| `lib/types.ts` | `Job`, `JobStatus`, `isTerminal` (client-safe) |
| `lib/db.ts` | SQLite open + jobs repository |
| `lib/storage.ts` | Download video to `storage/videos/` |
| `lib/jobs.ts` | `refreshJob` status/download orchestration |
| `lib/server.ts` | Default wiring of real deps for route handlers |
| `lib/auth.ts` | Session token sign/verify, password check |
| `lib/range.ts` | HTTP Range header parsing |
| `lib/studio-input.ts` | Form state → API input (client-safe) |
| `proxy.ts` | Auth guard |
| `app/api/**/route.ts` | login, logout, uploads, jobs, jobs/[id], jobs/[id]/cancel, videos/[id] |
| `app/login/page.tsx`, `app/page.tsx`, `app/gallery/page.tsx`, `app/layout.tsx` | Pages |
| `components/**` | `LogoutButton`, `studio/Studio`, `studio/MediaPicker`, `gallery/Gallery`, `gallery/JobCard` |
| `tests/*.test.ts` | Vitest unit tests |

---

### Task 1: Scaffold project and tooling

**Files:**
- Create (generated): Next.js app in `C:\laragon\www\seedance`
- Create: `vitest.config.ts`, `.env.example`, `lib/env.ts`
- Modify: `package.json` (scripts), `.gitignore`, `next.config.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string` in `lib/env.ts`; `npm test` runs Vitest; the `@/*` import alias maps to the project root.

- [ ] **Step 1: Generate the app** (the existing `docs/` and `.git` are allowed by create-next-app)

```bash
cd C:\laragon\www\seedance
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --disable-git --yes
```
Expected: `Success! Created seedance`.

- [ ] **Step 2: Install dependencies**

```bash
npm install better-sqlite3 zod
npm install -D vitest @types/better-sqlite3
```

- [ ] **Step 3: Add scripts to `package.json`** (merge into the existing `"scripts"` object)

```json
"test": "vitest run --passWithNoTests",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 5: Replace `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] **Step 6: Append to `.gitignore`**

```
# app data
/data
/storage
!.env.example
```

- [ ] **Step 7: Create `.env.example`**

```
# Higgsfield API key from https://console.higgsfield.ai
HF_API_KEY_ID=
HF_API_KEY_SECRET=
# Shared password for the login page
APP_PASSWORD=
# Random string, at least 32 characters (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
SESSION_SECRET=
# Optional, defaults to data/app.db
# DB_PATH=
```

- [ ] **Step 8: Create `lib/env.ts`**

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
```

- [ ] **Step 9: Verify**

Run: `npm test` → Expected: `No test files found, exiting with code 0`.
Run: `npm run build` → Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and SQLite deps"
```

---

### Task 2: Mode definitions and input validation

**Files:**
- Create: `lib/modes.ts`, `lib/schemas.ts`
- Test: `tests/schemas.test.ts`

**Interfaces:**
- Produces (`lib/modes.ts`): `MODES`, `type Mode = "text"|"image"|"reference"|"edit"|"extend"`, `isMode(v): v is Mode`, `MODE_PATHS: Record<Mode,string>`, `MODE_SPECS: Record<Mode, ModeSpec>`, `type SingleField = "image_url"|"end_image_url"|"video_url"`, `type MultiField = "image_urls"|"video_urls"|"audio_urls"`, `FIELD_KIND`, `type MediaKind = "image"|"video"|"audio"`, `UPLOAD_TYPES`, `isAllowedUploadType(t)`, `MAX_UPLOAD_BYTES`, `ASPECT_RATIOS`, `RESOLUTIONS`, `BITRATE_MODES`, `OUTPUT_FORMATS`, `DURATION`.
- Produces (`lib/schemas.ts`): `parseJobInput(mode: Mode, input: unknown): ParseResult` where `ParseResult = { ok: true; payload: Record<string, unknown> } | { ok: false; errors: { path: string; message: string }[] }`.

- [ ] **Step 1: Write the failing test** `tests/schemas.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseJobInput } from "@/lib/schemas";

const img = "https://cdn.example.com/a.png";
const vid = "https://cdn.example.com/a.mp4";
const aud = "https://cdn.example.com/a.mp3";
const many = (url: string, n: number) => Array.from({ length: n }, (_, i) => `${url}?${i}`);
const errorPaths = (r: ReturnType<typeof parseJobInput>) => (r.ok ? [] : r.errors.map((e) => e.path));

describe("parseJobInput", () => {
  it("applies text-to-video defaults", () => {
    expect(parseJobInput("text", { prompt: "a cat" })).toEqual({
      ok: true,
      payload: {
        prompt: "a cat",
        duration: 5,
        aspect_ratio: "16:9",
        output_format: "mp4",
        resolution: "720p",
        bitrate_mode: "high",
        generate_audio: true,
      },
    });
  });

  it("requires a prompt for text", () => {
    expect(errorPaths(parseJobInput("text", {}))).toContain("prompt");
  });

  it("rejects durations outside 4-30", () => {
    expect(errorPaths(parseJobInput("text", { prompt: "x", duration: 3 }))).toContain("duration");
    expect(errorPaths(parseJobInput("text", { prompt: "x", duration: 31 }))).toContain("duration");
    expect(parseJobInput("text", { prompt: "x", duration: 30 }).ok).toBe(true);
  });

  it("rejects fields that do not belong to the mode", () => {
    expect(parseJobInput("text", { prompt: "x", image_url: img }).ok).toBe(false);
  });

  it("requires image_url for image mode and drops an empty prompt", () => {
    expect(errorPaths(parseJobInput("image", {}))).toContain("image_url");
    const r = parseJobInput("image", { image_url: img, prompt: "" });
    expect(r.ok && r.payload).toEqual({
      image_url: img,
      duration: 5,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("only accepts https media urls", () => {
    expect(errorPaths(parseJobInput("image", { image_url: "http://cdn.example.com/a.png" }))).toContain("image_url");
  });

  it("needs at least one reference for reference mode", () => {
    expect(parseJobInput("reference", { prompt: "x" }).ok).toBe(false);
    expect(parseJobInput("reference", { prompt: "x", audio_urls: [aud] }).ok).toBe(true);
  });

  it("enforces reference array limits", () => {
    expect(errorPaths(parseJobInput("reference", { prompt: "x", image_urls: many(img, 31) }))).toContain("image_urls");
    expect(parseJobInput("reference", { prompt: "x", image_urls: many(img, 30) }).ok).toBe(true);
  });

  it("caps extra videos at 9 for edit because the source counts", () => {
    expect(errorPaths(parseJobInput("edit", { prompt: "x", video_url: vid, video_urls: many(vid, 10) }))).toContain("video_urls");
    expect(parseJobInput("edit", { prompt: "x", video_url: vid, video_urls: many(vid, 9) }).ok).toBe(true);
  });

  it("omits empty reference arrays and has no duration for edit", () => {
    const r = parseJobInput("edit", { prompt: "x", video_url: vid });
    expect(r.ok && r.payload).toEqual({
      prompt: "x",
      video_url: vid,
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("accepts a duration for extend", () => {
    const r = parseJobInput("extend", { prompt: "x", video_url: vid, duration: 8 });
    expect(r.ok && r.payload.duration).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/schemas.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/schemas"".

- [ ] **Step 3: Create `lib/modes.ts`**

```ts
export const MODES = ["text", "image", "reference", "edit", "extend"] as const;
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export const MODE_PATHS: Record<Mode, string> = {
  text: "/bytedance/seedance-2.5/text-to-video",
  image: "/bytedance/seedance-2.5/image-to-video",
  reference: "/bytedance/seedance-2.5/reference-to-video",
  edit: "/bytedance/seedance-2.5/video-edit",
  extend: "/bytedance/seedance-2.5/video-extend",
};

export const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;
export const RESOLUTIONS = ["480p", "720p"] as const;
export const BITRATE_MODES = ["standard", "high"] as const;
export const OUTPUT_FORMATS = ["mp4", "mov"] as const;
export const DURATION = { min: 4, max: 30, default: 5 } as const;

export type SingleField = "image_url" | "end_image_url" | "video_url";
export type MultiField = "image_urls" | "video_urls" | "audio_urls";

export interface ModeSpec {
  label: string;
  promptRequired: boolean;
  duration: boolean;
  aspectRatio: boolean;
  outputFormat: boolean;
  single: { field: SingleField; required: boolean }[];
  /** field -> max number of items */
  multi: Partial<Record<MultiField, number>>;
}

export const MODE_SPECS: Record<Mode, ModeSpec> = {
  text: {
    label: "Text → Video",
    promptRequired: true,
    duration: true,
    aspectRatio: true,
    outputFormat: true,
    single: [],
    multi: {},
  },
  image: {
    label: "Image → Video",
    promptRequired: false,
    duration: true,
    aspectRatio: false,
    outputFormat: false,
    single: [
      { field: "image_url", required: true },
      { field: "end_image_url", required: false },
    ],
    multi: {},
  },
  reference: {
    label: "Reference → Video",
    promptRequired: true,
    duration: true,
    aspectRatio: true,
    outputFormat: false,
    single: [],
    multi: { image_urls: 30, video_urls: 10, audio_urls: 10 },
  },
  edit: {
    label: "Edit Video",
    promptRequired: true,
    duration: false,
    aspectRatio: false,
    outputFormat: false,
    single: [{ field: "video_url", required: true }],
    // the source video counts toward the 10-video limit
    multi: { image_urls: 30, video_urls: 9, audio_urls: 10 },
  },
  extend: {
    label: "Extend Video",
    promptRequired: true,
    duration: true,
    aspectRatio: false,
    outputFormat: false,
    single: [{ field: "video_url", required: true }],
    multi: { image_urls: 30, video_urls: 9, audio_urls: 10 },
  },
};

export const UPLOAD_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac"],
} as const;
export type MediaKind = keyof typeof UPLOAD_TYPES;

export const FIELD_KIND: Record<SingleField | MultiField, MediaKind> = {
  image_url: "image",
  end_image_url: "image",
  video_url: "video",
  image_urls: "image",
  video_urls: "video",
  audio_urls: "audio",
};

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function isAllowedUploadType(contentType: string): boolean {
  return Object.values(UPLOAD_TYPES).some((types) => (types as readonly string[]).includes(contentType));
}
```

- [ ] **Step 4: Create `lib/schemas.ts`**

```ts
import { z } from "zod";
import {
  ASPECT_RATIOS,
  BITRATE_MODES,
  DURATION,
  MODES,
  MODE_SPECS,
  OUTPUT_FORMATS,
  RESOLUTIONS,
  type Mode,
} from "./modes";

export type ParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: { path: string; message: string }[] };

const httpsUrl = z.url({ protocol: /^https$/, message: "Must be an https URL" });

function buildSchema(mode: Mode) {
  const spec = MODE_SPECS[mode];
  const shape: Record<string, z.ZodType> = {
    prompt: spec.promptRequired ? z.string().trim().min(1, "Prompt is required") : z.string().trim().optional(),
    resolution: z.enum(RESOLUTIONS).default("720p"),
    bitrate_mode: z.enum(BITRATE_MODES).default("high"),
    generate_audio: z.boolean().default(true),
  };
  if (spec.duration) {
    shape.duration = z.number().int().min(DURATION.min).max(DURATION.max).default(DURATION.default);
  }
  if (spec.aspectRatio) shape.aspect_ratio = z.enum(ASPECT_RATIOS).default("16:9");
  if (spec.outputFormat) shape.output_format = z.enum(OUTPUT_FORMATS).default("mp4");
  for (const { field, required } of spec.single) {
    shape[field] = required ? httpsUrl : httpsUrl.optional();
  }
  for (const [field, max] of Object.entries(spec.multi)) {
    shape[field] = z.array(httpsUrl).max(max, `At most ${max} items`).default([]);
  }

  const schema = z.strictObject(shape);
  if (mode !== "reference") return schema;
  return schema.refine(
    (v) => ["image_urls", "video_urls", "audio_urls"].some((k) => (v[k] as unknown[]).length > 0),
    { message: "Add at least one reference image, video or audio" },
  );
}

const SCHEMAS = Object.fromEntries(MODES.map((m) => [m, buildSchema(m)])) as Record<Mode, z.ZodType>;

/** Drops unset values, empty strings and empty arrays so Higgsfield only sees real inputs. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

export function parseJobInput(mode: Mode, input: unknown): ParseResult {
  const result = SCHEMAS[mode].safeParse(input ?? {});
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  return { ok: true, payload: compact(result.data as Record<string, unknown>) };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/schemas.test.ts` → Expected: all 11 tests PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/modes.ts lib/schemas.ts tests/schemas.test.ts
git commit -m "feat: add Seedance 2.5 mode specs and input validation"
```

---

### Task 3: Higgsfield client

**Files:**
- Create: `lib/higgsfield.ts`
- Test: `tests/higgsfield.test.ts`

**Interfaces:**
- Consumes: `MODE_PATHS`, `Mode` (Task 2); `requireEnv` (Task 1).
- Produces:
  - `HF_BASE_URL`
  - `type HfStatus = "queued"|"in_progress"|"completed"|"failed"|"nsfw"|"canceled"`
  - `class HiggsfieldError extends Error { status: number }`
  - `interface SubmitResult { status: HfStatus; request_id: string; status_url: string; cancel_url: string }`
  - `interface StatusResult { status: HfStatus; videoUrl: string | null; error: string | null }`
  - `interface UploadTarget { public_url: string; upload_url: string; content_type: string; upload_headers: Record<string, string> }`
  - `interface HiggsfieldClient { submit(mode, payload): Promise<SubmitResult>; getStatus(statusUrl): Promise<StatusResult>; cancel(cancelUrl): Promise<boolean>; generateUploadUrl(contentType): Promise<UploadTarget>; uploadFile(file: Blob, contentType: string): Promise<string> }`
  - `createHiggsfieldClient({ keyId, keySecret, fetch?, baseUrl? })`
  - `getHiggsfield()` (env-based singleton)
  - `describeError(err): { httpStatus: number; message: string }`

- [ ] **Step 1: Write the failing test** `tests/higgsfield.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { createHiggsfieldClient, describeError, HiggsfieldError } from "@/lib/higgsfield";

const BASE = "https://api.higgsfield.ai";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}
const client = (f: typeof fetch) => createHiggsfieldClient({ keyId: "kid", keySecret: "ksec", fetch: f });

describe("higgsfield client", () => {
  it("submits to the mode endpoint with the key header", async () => {
    const f = mockFetch(
      json({ status: "queued", request_id: "r1", status_url: `${BASE}/requests/r1/status`, cancel_url: `${BASE}/requests/r1/cancel` }),
    );
    const r = await client(f).submit("extend", { prompt: "go" });
    expect(r.request_id).toBe("r1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${BASE}/bytedance/seedance-2.5/video-extend`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Key kid:ksec");
    expect(JSON.parse(init?.body as string)).toEqual({ prompt: "go" });
  });

  it("maps a completed status to the video url", async () => {
    const f = mockFetch(json({ status: "completed", request_id: "r1", video: { url: "https://cdn.example.com/v.mp4" }, error: null }));
    await expect(client(f).getStatus(`${BASE}/requests/r1/status`)).resolves.toEqual({
      status: "completed",
      videoUrl: "https://cdn.example.com/v.mp4",
      error: null,
    });
  });

  it("refuses to send the key to a non-Higgsfield url", async () => {
    const f = mockFetch();
    await expect(client(f).getStatus("https://evil.example.com/requests/r1/status")).rejects.toThrow(/non-Higgsfield/);
    expect(f).not.toHaveBeenCalled();
  });

  it("throws HiggsfieldError with the detail message", async () => {
    const f = mockFetch(json({ detail: [{ loc: ["body", "prompt"], msg: "Field required" }] }, 422));
    const err = await client(f).submit("text", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiggsfieldError);
    expect((err as HiggsfieldError).status).toBe(422);
    expect((err as HiggsfieldError).message).toBe("body.prompt: Field required");
  });

  it("reports whether a cancel was accepted", async () => {
    const f = mockFetch(new Response(null, { status: 202 }), json({ detail: "already running" }, 400));
    const c = client(f);
    await expect(c.cancel(`${BASE}/requests/r1/cancel`)).resolves.toBe(true);
    await expect(c.cancel(`${BASE}/requests/r1/cancel`)).resolves.toBe(false);
  });

  it("uploads a file without sending credentials to storage", async () => {
    const f = mockFetch(
      json({
        public_url: "https://cdn.example.com/in.png",
        upload_url: "https://storage.example.com/put",
        content_type: "image/png",
        upload_headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" },
      }),
      new Response(null, { status: 200 }),
    );
    const url = await client(f).uploadFile(new Blob(["png"], { type: "image/png" }), "image/png");
    expect(url).toBe("https://cdn.example.com/in.png");
    expect(f.mock.calls[0][0]).toBe(`${BASE}/files/generate-upload-url`);
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ content_type: "image/png" });
    const [putUrl, putInit] = f.mock.calls[1];
    expect(putUrl).toBe("https://storage.example.com/put");
    expect(putInit?.method).toBe("PUT");
    expect(putInit?.headers).toEqual({ "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" });
  });
});

describe("describeError", () => {
  it("hides auth failures behind a clear message", () => {
    expect(describeError(new HiggsfieldError(401, "bad"))).toEqual({
      httpStatus: 502,
      message: "Higgsfield API key is invalid or missing",
    });
  });
  it("passes validation messages through", () => {
    expect(describeError(new HiggsfieldError(422, "prompt: required"))).toEqual({ httpStatus: 422, message: "prompt: required" });
  });
  it("flags rate limits", () => {
    expect(describeError(new HiggsfieldError(429, "x")).httpStatus).toBe(429);
  });
  it("reports unknown errors as 500 with their message", () => {
    expect(describeError(new Error("Missing environment variable HF_API_KEY_ID"))).toEqual({
      httpStatus: 500,
      message: "Missing environment variable HF_API_KEY_ID",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/higgsfield.test.ts` → Expected: FAIL, cannot resolve `@/lib/higgsfield`.

- [ ] **Step 3: Implement `lib/higgsfield.ts`**

```ts
import { requireEnv } from "./env";
import { MODE_PATHS, type Mode } from "./modes";

export const HF_BASE_URL = "https://api.higgsfield.ai";

export type HfStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export class HiggsfieldError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HiggsfieldError";
  }
}

export interface SubmitResult {
  status: HfStatus;
  request_id: string;
  status_url: string;
  cancel_url: string;
}

export interface StatusResult {
  status: HfStatus;
  videoUrl: string | null;
  error: string | null;
}

export interface UploadTarget {
  public_url: string;
  upload_url: string;
  content_type: string;
  upload_headers: Record<string, string>;
}

export interface HiggsfieldClient {
  submit(mode: Mode, payload: Record<string, unknown>): Promise<SubmitResult>;
  getStatus(statusUrl: string): Promise<StatusResult>;
  cancel(cancelUrl: string): Promise<boolean>;
  generateUploadUrl(contentType: string): Promise<UploadTarget>;
  /** Uploads to Higgsfield storage and returns the public URL to pass to a model. */
  uploadFile(file: Blob, contentType: string): Promise<string>;
}

export interface ClientOptions {
  keyId: string;
  keySecret: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

interface RawStatus {
  status: HfStatus;
  video?: { url?: string } | null;
  error?: string | null;
}

async function readDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const detail = JSON.parse(text)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => [Array.isArray(d?.loc) ? d.loc.join(".") : null, d?.msg].filter(Boolean).join(": "))
        .join("; ");
    }
  } catch {
    // not JSON, fall through to raw text
  }
  return text.slice(0, 300) || `HTTP ${res.status}`;
}

export function createHiggsfieldClient(opts: ClientOptions): HiggsfieldClient {
  const baseUrl = opts.baseUrl ?? HF_BASE_URL;
  const doFetch = opts.fetch ?? fetch;
  const authorization = `Key ${opts.keyId}:${opts.keySecret}`;

  async function call(url: string, method: string, body?: unknown): Promise<Response> {
    if (!url.startsWith(`${baseUrl}/`)) throw new Error(`Refusing to call non-Higgsfield URL: ${url}`);
    try {
      return await doFetch(url, {
        method,
        headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new HiggsfieldError(0, `Network error: ${(err as Error).message}`);
    }
  }

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new HiggsfieldError(res.status, await readDetail(res));
    return (await res.json()) as T;
  }

  const client: HiggsfieldClient = {
    async submit(mode, payload) {
      return json<SubmitResult>(await call(`${baseUrl}${MODE_PATHS[mode]}`, "POST", payload));
    },
    async getStatus(statusUrl) {
      const raw = await json<RawStatus>(await call(statusUrl, "GET"));
      return { status: raw.status, videoUrl: raw.video?.url ?? null, error: raw.error ?? null };
    },
    async cancel(cancelUrl) {
      const res = await call(cancelUrl, "POST");
      if (res.status === 202) return true;
      if (res.status === 400) return false;
      throw new HiggsfieldError(res.status, await readDetail(res));
    },
    async generateUploadUrl(contentType) {
      return json<UploadTarget>(await call(`${baseUrl}/files/generate-upload-url`, "POST", { content_type: contentType }));
    },
    async uploadFile(file, contentType) {
      const target = await client.generateUploadUrl(contentType);
      // presigned storage URL: send only the returned headers, never the API key
      const res = await doFetch(target.upload_url, { method: "PUT", headers: target.upload_headers, body: file });
      if (!res.ok) throw new Error(`Upload to storage failed: HTTP ${res.status}`);
      return target.public_url;
    },
  };
  return client;
}

let shared: HiggsfieldClient | null = null;

export function getHiggsfield(): HiggsfieldClient {
  shared ??= createHiggsfieldClient({
    keyId: requireEnv("HF_API_KEY_ID"),
    keySecret: requireEnv("HF_API_KEY_SECRET"),
  });
  return shared;
}

/** Maps any error to the HTTP status and message our API returns to the browser. */
export function describeError(err: unknown): { httpStatus: number; message: string } {
  if (err instanceof HiggsfieldError) {
    if (err.status === 401 || err.status === 403) {
      return { httpStatus: 502, message: "Higgsfield API key is invalid or missing" };
    }
    if (err.status === 429) return { httpStatus: 429, message: "Rate limited by Higgsfield, try again shortly" };
    if (err.status === 400 || err.status === 422) return { httpStatus: 422, message: err.message };
    if (err.status === 0 || err.status >= 500) return { httpStatus: 502, message: "Higgsfield is unavailable, try again" };
    return { httpStatus: 502, message: err.message };
  }
  return { httpStatus: 500, message: err instanceof Error ? err.message : "Unexpected error" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/higgsfield.test.ts` → Expected: 10 tests PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/higgsfield.ts tests/higgsfield.test.ts
git commit -m "feat: add Higgsfield API client"
```

---

### Task 4: Job types and SQLite repository

**Files:**
- Create: `lib/types.ts`, `lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `Mode` (Task 2).
- Produces:
  - `lib/types.ts`: `JOB_STATUSES`, `type JobStatus`, `isTerminal(status): boolean`, `interface Job { id; mode: Mode; params: Record<string, unknown>; request_id; status_url; cancel_url; status: JobStatus; error; remote_url; local_path; created_at; updated_at }`. All nullable fields are `string | null`.
  - `lib/db.ts`: `type Db`, `openDb(file)`, `getDb()`, `insertJob(db, NewJob, now?) → Job`, `getJob(db, id) → Job | null`, `listJobs(db, limit = 100) → Job[]`, `updateJob(db, id, JobPatch, now?) → Job | null`.

- [ ] **Step 1: Write the failing test** `tests/db.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, insertJob, listJobs, openDb, updateJob, type Db } from "@/lib/db";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("jobs repository", () => {
  it("round-trips params as JSON", () => {
    insertJob(db, { id: "a", mode: "text", params: { prompt: "hi", duration: 5 }, status: "queued" });
    expect(getJob(db, "a")).toMatchObject({
      id: "a",
      mode: "text",
      params: { prompt: "hi", duration: 5 },
      status: "queued",
      request_id: null,
      local_path: null,
    });
  });

  it("returns null for unknown ids", () => {
    expect(getJob(db, "nope")).toBeNull();
  });

  it("lists newest first", () => {
    insertJob(db, { id: "old", mode: "text", params: {}, status: "queued" }, new Date("2026-01-01T00:00:00Z"));
    insertJob(db, { id: "new", mode: "text", params: {}, status: "queued" }, new Date("2026-02-01T00:00:00Z"));
    expect(listJobs(db).map((j) => j.id)).toEqual(["new", "old"]);
  });

  it("updates only the given fields and bumps updated_at", () => {
    insertJob(db, { id: "a", mode: "text", params: {}, status: "queued" }, new Date("2026-01-01T00:00:00Z"));
    const j = updateJob(
      db,
      "a",
      { status: "completed", remote_url: "https://cdn.example.com/v.mp4" },
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(j).toMatchObject({
      status: "completed",
      remote_url: "https://cdn.example.com/v.mp4",
      error: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db.test.ts` → Expected: FAIL, cannot resolve `@/lib/db`.

- [ ] **Step 3: Create `lib/types.ts`**

```ts
import type { Mode } from "./modes";

export const JOB_STATUSES = ["queued", "in_progress", "completed", "failed", "nsfw", "canceled", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isTerminal(status: JobStatus): boolean {
  return status !== "queued" && status !== "in_progress";
}

export interface Job {
  id: string;
  mode: Mode;
  /** exact payload sent to Higgsfield */
  params: Record<string, unknown>;
  request_id: string | null;
  status_url: string | null;
  cancel_url: string | null;
  status: JobStatus;
  error: string | null;
  remote_url: string | null;
  /** file name inside storage/videos */
  local_path: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Create `lib/db.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Mode } from "./modes";
import type { Job, JobStatus } from "./types";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  params TEXT NOT NULL,
  request_id TEXT,
  status_url TEXT,
  cancel_url TEXT,
  status TEXT NOT NULL,
  error TEXT,
  remote_url TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_created_at ON jobs (created_at DESC);
`;

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

let shared: Db | null = null;

export function getDb(): Db {
  shared ??= openDb(process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db"));
  return shared;
}

type Row = Omit<Job, "params" | "mode" | "status"> & { params: string; mode: string; status: string };

function toJob(row: Row): Job {
  return { ...row, mode: row.mode as Mode, status: row.status as JobStatus, params: JSON.parse(row.params) };
}

export type NewJob = Pick<Job, "id" | "mode" | "params" | "status"> &
  Partial<Pick<Job, "request_id" | "status_url" | "cancel_url" | "error">>;

export function insertJob(db: Db, job: NewJob, now = new Date()): Job {
  const ts = now.toISOString();
  db.prepare(
    `INSERT INTO jobs (id, mode, params, request_id, status_url, cancel_url, status, error, remote_url, local_path, created_at, updated_at)
     VALUES (@id, @mode, @params, @request_id, @status_url, @cancel_url, @status, @error, NULL, NULL, @ts, @ts)`,
  ).run({
    id: job.id,
    mode: job.mode,
    params: JSON.stringify(job.params),
    request_id: job.request_id ?? null,
    status_url: job.status_url ?? null,
    cancel_url: job.cancel_url ?? null,
    status: job.status,
    error: job.error ?? null,
    ts,
  });
  return getJob(db, job.id)!;
}

export function getJob(db: Db, id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  return row ? toJob(row) : null;
}

export function listJobs(db: Db, limit = 100): Job[] {
  const rows = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as Row[];
  return rows.map(toJob);
}

const PATCHABLE = ["request_id", "status_url", "cancel_url", "status", "error", "remote_url", "local_path"] as const;
export type JobPatch = Partial<Pick<Job, (typeof PATCHABLE)[number]>>;

export function updateJob(db: Db, id: string, patch: JobPatch, now = new Date()): Job | null {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (keys.length > 0) {
    // column names come from the fixed PATCHABLE list, never from input
    const sets = keys.map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE jobs SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
      ...Object.fromEntries(keys.map((k) => [k, patch[k] ?? null])),
      updated_at: now.toISOString(),
      id,
    });
  }
  return getJob(db, id);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/db.test.ts` → Expected: 4 tests PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db.ts tests/db.test.ts
git commit -m "feat: add SQLite job repository"
```

---

### Task 5: Video storage and job refresh

**Files:**
- Create: `lib/storage.ts`, `lib/jobs.ts`, `lib/server.ts`
- Test: `tests/storage.test.ts`, `tests/jobs.test.ts`

**Interfaces:**
- Consumes: `getJob`, `updateJob`, `getDb`, `Db` (Task 4); `HiggsfieldClient`, `StatusResult`, `getHiggsfield` (Task 3); `Job` (Task 4).
- Produces:
  - `VIDEO_DIR`
  - `downloadVideo(url, fileName, opts?: { dir?: string; fetch?: typeof fetch }): Promise<string>`, which returns `fileName`
  - `interface RefreshDeps { db: Db; hf: Pick<HiggsfieldClient, "getStatus">; download(url: string, fileName: string): Promise<string> }`
  - `videoFileName(job): string`
  - `refreshJob(deps, id): Promise<Job | null>`
  - `refreshDeps(): RefreshDeps` (in `lib/server.ts`)

- [ ] **Step 1: Write the failing storage test** `tests/storage.test.ts`

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadVideo } from "@/lib/storage";

let dir: string;
beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "seedance-"));
});
afterEach(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true });
});

describe("downloadVideo", () => {
  it("writes the body to <dir>/<fileName>", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response("video-bytes"));
    await expect(downloadVideo("https://cdn.example.com/v.mp4", "job1.mp4", { dir, fetch: f })).resolves.toBe("job1.mp4");
    expect(await fs.promises.readFile(path.join(dir, "job1.mp4"), "utf8")).toBe("video-bytes");
  });

  it("leaves no file behind on HTTP errors", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(downloadVideo("https://cdn.example.com/v.mp4", "job1.mp4", { dir, fetch: f })).rejects.toThrow("HTTP 403");
    expect(await fs.promises.readdir(dir)).toEqual([]);
  });

  it("rejects unsafe file names", async () => {
    await expect(
      downloadVideo("https://cdn.example.com/v.mp4", "../x.mp4", { dir, fetch: vi.fn<typeof fetch>() }),
    ).rejects.toThrow(/Invalid/);
  });
});
```

- [ ] **Step 2: Write the failing jobs test** `tests/jobs.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertJob, openDb, type Db } from "@/lib/db";
import type { StatusResult } from "@/lib/higgsfield";
import { refreshJob, type RefreshDeps } from "@/lib/jobs";

type Download = RefreshDeps["download"];
const STATUS_URL = "https://api.higgsfield.ai/requests/r1/status";
let db: Db;

function deps(status: StatusResult | Error, download: Download = vi.fn<Download>(async (_url, name) => name)) {
  const getStatus = vi.fn(async () => {
    if (status instanceof Error) throw status;
    return status;
  });
  return { db, hf: { getStatus }, download };
}

beforeEach(() => {
  db = openDb(":memory:");
  insertJob(db, { id: "j1", mode: "text", params: { prompt: "x", output_format: "mov" }, status: "queued", status_url: STATUS_URL });
});

describe("refreshJob", () => {
  it("returns null for unknown jobs", async () => {
    expect(await refreshJob(deps({ status: "queued", videoUrl: null, error: null }), "zzz")).toBeNull();
  });

  it("stores in-progress status", async () => {
    const j = await refreshJob(deps({ status: "in_progress", videoUrl: null, error: null }), "j1");
    expect(j?.status).toBe("in_progress");
  });

  it("downloads the video once completed, using the output format extension", async () => {
    const d = deps({ status: "completed", videoUrl: "https://cdn.example.com/v.mov", error: null });
    const j = await refreshJob(d, "j1");
    expect(d.download).toHaveBeenCalledWith("https://cdn.example.com/v.mov", "j1.mov");
    expect(j).toMatchObject({ status: "completed", remote_url: "https://cdn.example.com/v.mov", local_path: "j1.mov" });
  });

  it("keeps the job completed when the download fails", async () => {
    const failing = vi.fn<Download>(async () => {
      throw new Error("boom");
    });
    const j = await refreshJob(deps({ status: "completed", videoUrl: "https://cdn.example.com/v.mov", error: null }, failing), "j1");
    expect(j).toMatchObject({ status: "completed", local_path: null });
  });

  it("records the reason for nsfw jobs", async () => {
    const j = await refreshJob(deps({ status: "nsfw", videoUrl: null, error: null }), "j1");
    expect(j).toMatchObject({ status: "nsfw", error: "nsfw" });
  });

  it("does not poll terminal jobs", async () => {
    const d = deps({ status: "failed", videoUrl: null, error: "bad prompt" });
    expect((await refreshJob(d, "j1"))?.error).toBe("bad prompt");
    await refreshJob(d, "j1");
    expect(d.hf.getStatus).toHaveBeenCalledTimes(1);
  });

  it("leaves the job untouched when the status call fails", async () => {
    const j = await refreshJob(deps(new Error("network")), "j1");
    expect(j?.status).toBe("queued");
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run tests/storage.test.ts tests/jobs.test.ts` → Expected: FAIL, cannot resolve `@/lib/storage` / `@/lib/jobs`.

- [ ] **Step 4: Create `lib/storage.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export const VIDEO_DIR = path.join(process.cwd(), "storage", "videos");

const SAFE_NAME = /^[\w-]+\.(mp4|mov)$/;

/** Streams a remote video to <dir>/<fileName> atomically and returns fileName. */
export async function downloadVideo(
  url: string,
  fileName: string,
  opts: { dir?: string; fetch?: typeof fetch } = {},
): Promise<string> {
  if (!SAFE_NAME.test(fileName)) throw new Error(`Invalid video file name: ${fileName}`);
  const dir = opts.dir ?? VIDEO_DIR;
  const doFetch = opts.fetch ?? fetch;
  await fs.promises.mkdir(dir, { recursive: true });

  const res = await doFetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);

  const finalPath = path.join(dir, fileName);
  const tmpPath = `${finalPath}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as NodeReadableStream), fs.createWriteStream(tmpPath));
    await fs.promises.rename(tmpPath, finalPath);
  } catch (err) {
    await fs.promises.rm(tmpPath, { force: true });
    throw err;
  }
  return fileName;
}
```

- [ ] **Step 5: Create `lib/jobs.ts`**

```ts
import { getJob, updateJob, type Db } from "./db";
import type { HiggsfieldClient } from "./higgsfield";
import type { Job } from "./types";

export interface RefreshDeps {
  db: Db;
  hf: Pick<HiggsfieldClient, "getStatus">;
  download(url: string, fileName: string): Promise<string>;
}

export function videoFileName(job: Pick<Job, "id" | "params">): string {
  return `${job.id}.${job.params.output_format === "mov" ? "mov" : "mp4"}`;
}

async function doRefresh(deps: RefreshDeps, id: string): Promise<Job | null> {
  let job = getJob(deps.db, id);
  if (!job) return null;

  if ((job.status === "queued" || job.status === "in_progress") && job.status_url) {
    try {
      const s = await deps.hf.getStatus(job.status_url);
      const failed = s.status === "failed" || s.status === "nsfw";
      job = updateJob(deps.db, id, {
        status: s.status,
        remote_url: s.videoUrl ?? job.remote_url,
        error: failed ? (s.error ?? s.status) : job.error,
      })!;
    } catch (err) {
      console.warn(`[jobs] status check failed for ${id}:`, err);
      return job;
    }
  }

  if (job.status === "completed" && job.remote_url && !job.local_path) {
    try {
      const fileName = await deps.download(job.remote_url, videoFileName(job));
      job = updateJob(deps.db, id, { local_path: fileName })!;
    } catch (err) {
      // keep the job completed; the gallery falls back to remote_url and the next refresh retries
      console.warn(`[jobs] download failed for ${id}:`, err);
    }
  }
  return job;
}

// one refresh per job at a time, so two open tabs don't download the same video twice
const inflight = new Map<string, Promise<Job | null>>();

export function refreshJob(deps: RefreshDeps, id: string): Promise<Job | null> {
  const running = inflight.get(id);
  if (running) return running;
  const p = doRefresh(deps, id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
```

- [ ] **Step 6: Create `lib/server.ts`**

```ts
import { getDb } from "./db";
import { getHiggsfield } from "./higgsfield";
import type { RefreshDeps } from "./jobs";
import { downloadVideo } from "./storage";

export function refreshDeps(): RefreshDeps {
  return {
    db: getDb(),
    // resolved lazily so missing keys surface as a caught status error, not a crash
    hf: { getStatus: (url) => getHiggsfield().getStatus(url) },
    download: (url, fileName) => downloadVideo(url, fileName),
  };
}
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run tests/storage.test.ts tests/jobs.test.ts` → Expected: 10 tests PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/storage.ts lib/jobs.ts lib/server.ts tests/storage.test.ts tests/jobs.test.ts
git commit -m "feat: poll job status and store finished videos locally"
```

---

### Task 6: Password login and auth guard

**Files:**
- Create: `lib/auth.ts`, `proxy.ts`, `app/api/login/route.ts`, `app/api/logout/route.ts`, `app/login/page.tsx`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `requireEnv` (Task 1).
- Produces: `SESSION_COOKIE`, `SESSION_MAX_AGE_SECONDS`, `signSession(secret, now?)`, `verifySession(token, secret, now?)`, `checkPassword(input, expected)`, `sessionSecret()`. After this task every route except `/login` and `/api/login` requires a session.

- [ ] **Step 1: Write the failing test** `tests/auth.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { checkPassword, signSession, verifySession } from "@/lib/auth";

const SECRET = "s".repeat(32);

describe("session tokens", () => {
  it("accepts a fresh token", () => {
    expect(verifySession(signSession(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession("x".repeat(32)), SECRET)).toBe(false);
  });

  it("rejects expired tokens", () => {
    const token = signSession(SECRET, 0);
    expect(verifySession(token, SECRET, 31 * 24 * 3600 * 1000)).toBe(false);
  });

  it("rejects tampered and malformed tokens", () => {
    const [, sig] = signSession(SECRET).split(".");
    expect(verifySession(`9999999999.${sig}`, SECRET)).toBe(false);
    expect(verifySession("garbage", SECRET)).toBe(false);
    expect(verifySession(undefined, SECRET)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("matches only the exact password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter", "hunter2")).toBe(false);
    expect(checkPassword(undefined, "hunter2")).toBe(false);
    expect(checkPassword("", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/auth.test.ts` → Expected: FAIL, cannot resolve `@/lib/auth`.

- [ ] **Step 3: Create `lib/auth.ts`**

```ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

export const SESSION_COOKIE = "seedance_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Constant-time comparison that also hides length differences. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signSession(secret: string, now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS);
  return `${exp}.${sign(secret, exp)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= now) return false;
  return safeEqual(sig, sign(secret, exp));
}

export function checkPassword(input: unknown, expected: string): boolean {
  return typeof input === "string" && expected.length > 0 && safeEqual(input, expected);
}

export function sessionSecret(): string {
  const secret = requireEnv("SESSION_SECRET");
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/auth.test.ts` → Expected: 5 tests PASS.

- [ ] **Step 5: Create `proxy.ts`** (project root)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Create `app/api/login/route.ts`**

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, checkPassword, sessionSecret, signSession } from "@/lib/auth";
import { requireEnv } from "@/lib/env";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!checkPassword(body?.password, requireEnv("APP_PASSWORD"))) {
    // slow down guessing
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
```

- [ ] **Step 7: Create `app/api/logout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
```

- [ ] **Step 8: Create `app/login/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Network error, try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Seedance Studio</h1>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy || !password}
        className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 9: Verify manually**

Create `.env.local` with real values (copy `.env.example`; you may use placeholder HF keys for now). Run `npm run dev`, then:
- `curl -i http://localhost:3000/api/jobs` → Expected: `401` with `{"error":"Unauthorized"}`.
- Open `http://localhost:3000/` → Expected: redirected to `/login`. A wrong password shows "Wrong password"; the right one redirects to `/`.

- [ ] **Step 10: Commit**

```bash
git add lib/auth.ts proxy.ts app/api/login app/api/logout app/login tests/auth.test.ts
git commit -m "feat: add password login and auth guard"
```

---

### Task 7: API routes

**Files:**
- Create: `lib/range.ts`, `app/api/uploads/route.ts`, `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/cancel/route.ts`, `app/api/videos/[id]/route.ts`
- Test: `tests/range.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces (HTTP contract used by the UI):
  - `POST /api/uploads` (multipart `file`) → `200 { url }` | `400/413/415/5xx { error }`
  - `GET /api/jobs` → `{ jobs: Job[] }`
  - `POST /api/jobs` body `{ mode, input }` → `201 { job }` | `400 { error, errors? }` | `4xx/5xx { error, job }`
  - `GET /api/jobs/:id` → `{ job }` | `404`
  - `POST /api/jobs/:id/cancel` → `{ job }` | `404/409/5xx { error }`
  - `GET /api/videos/:id` → video stream with Range support
  - `parseRange(header, size): { start; end } | "invalid" | null`

- [ ] **Step 1: Write the failing test** `tests/range.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/range";

describe("parseRange", () => {
  it("returns null without a header", () => expect(parseRange(null, 100)).toBeNull());
  it("parses a closed range", () => expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 }));
  it("parses an open range", () => expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 }));
  it("parses a suffix range", () => expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 }));
  it("clamps the end", () => expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 }));
  it("rejects unsatisfiable or malformed ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-1", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/range.test.ts` → Expected: FAIL, cannot resolve `@/lib/range`.

- [ ] **Step 3: Create `lib/range.ts`**

```ts
/** Parses a single-range `Range: bytes=...` header. Multi-range requests are treated as invalid. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";

  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/range.test.ts` → Expected: 6 tests PASS.

- [ ] **Step 5: Create `app/api/uploads/route.ts`**

```ts
import { NextResponse } from "next/server";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { MAX_UPLOAD_BYTES, isAllowedUploadType } from "@/lib/modes";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 413 });
  }
  try {
    const url = await getHiggsfield().uploadFile(file, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
```

- [ ] **Step 6: Create `app/api/jobs/route.ts`**

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, insertJob, listJobs, updateJob } from "@/lib/db";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { isMode } from "@/lib/modes";
import { parseJobInput } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json({ jobs: listJobs(getDb()) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mode?: unknown; input?: unknown } | null;
  if (!body || !isMode(body.mode)) return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  const mode = body.mode;

  const parsed = parseJobInput(mode, body.input);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid input", errors: parsed.errors }, { status: 400 });

  const db = getDb();
  const job = insertJob(db, { id: randomUUID(), mode, params: parsed.payload, status: "queued" });
  try {
    const r = await getHiggsfield().submit(mode, parsed.payload);
    const updated = updateJob(db, job.id, {
      request_id: r.request_id,
      status_url: r.status_url,
      cancel_url: r.cancel_url,
      status: r.status,
    });
    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    const { httpStatus, message } = describeError(err);
    const failed = updateJob(db, job.id, { status: "error", error: message });
    return NextResponse.json({ error: message, job: failed }, { status: httpStatus });
  }
}
```

- [ ] **Step 7: Create `app/api/jobs/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { refreshJob } from "@/lib/jobs";
import { refreshDeps } from "@/lib/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await refreshJob(refreshDeps(), id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}
```

- [ ] **Step 8: Create `app/api/jobs/[id]/cancel/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getDb, getJob, updateJob } from "@/lib/db";
import { describeError, getHiggsfield } from "@/lib/higgsfield";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const job = getJob(db, id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "queued" || !job.cancel_url) {
    return NextResponse.json({ error: "Only queued jobs can be canceled" }, { status: 409 });
  }
  try {
    const accepted = await getHiggsfield().cancel(job.cancel_url);
    if (!accepted) {
      return NextResponse.json({ error: "The job already started and can no longer be canceled" }, { status: 409 });
    }
    return NextResponse.json({ job: updateJob(db, id, { status: "canceled" }) });
  } catch (err) {
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
```

- [ ] **Step 9: Create `app/api/videos/[id]/route.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDb, getJob } from "@/lib/db";
import { parseRange } from "@/lib/range";
import { VIDEO_DIR } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(getDb(), id);
  if (!job?.local_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = path.join(VIDEO_DIR, path.basename(job.local_path));
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.endsWith(".mov") ? "video/quicktime" : "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  }
  if (range) {
    const stream = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(stat.size) } });
}
```

- [ ] **Step 10: Verify**

Run: `npm test` → Expected: all tests PASS.
Run: `npm run typecheck` and `npm run build` → Expected: no errors.
With `npm run dev` and a logged-in session cookie (copy it from the browser devtools):
- `POST /api/jobs` with `{"mode":"text","input":{}}` → Expected: `400` with `errors[0].path == "prompt"`.
- `GET /api/jobs/does-not-exist` → Expected: `404`.

- [ ] **Step 11: Commit**

```bash
git add lib/range.ts app/api tests/range.test.ts
git commit -m "feat: add job, upload, cancel and video API routes"
```

---

### Task 8: Studio UI

**Files:**
- Create: `lib/studio-input.ts`, `components/LogoutButton.tsx`, `components/studio/MediaPicker.tsx`, `components/studio/Studio.tsx`
- Modify (replace): `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `tests/studio-input.test.ts`

**Interfaces:**
- Consumes: `MODE_SPECS`, enums, `FIELD_KIND`, `UPLOAD_TYPES`, `isMode` (Task 2); HTTP contract (Task 7).
- Produces: `interface FormState`, `DEFAULT_FORM`, `buildInput(mode, form): Record<string, unknown>`, and `<Studio prefill={{ mode?, prompt?, video_url? }} />`. The Studio page accepts `?mode=&prompt=&video_url=` query params (Task 9 links to these).

- [ ] **Step 1: Write the failing test** `tests/studio-input.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, buildInput } from "@/lib/studio-input";

describe("buildInput", () => {
  it("sends only the fields the mode supports", () => {
    const form = {
      ...DEFAULT_FORM,
      prompt: "  waves  ",
      media: { video_url: ["https://cdn.example.com/v.mp4"], image_url: ["https://cdn.example.com/i.png"] },
    };
    expect(buildInput("edit", form)).toEqual({
      prompt: "waves",
      video_url: "https://cdn.example.com/v.mp4",
      resolution: "720p",
      bitrate_mode: "high",
      generate_audio: true,
    });
  });

  it("includes text-only options for text mode and skips an empty prompt elsewhere", () => {
    expect(buildInput("text", { ...DEFAULT_FORM, prompt: "cat" })).toMatchObject({
      prompt: "cat",
      duration: 5,
      aspect_ratio: "16:9",
      output_format: "mp4",
    });
    expect(buildInput("image", { ...DEFAULT_FORM, media: { image_url: ["https://cdn.example.com/i.png"] } })).not.toHaveProperty("prompt");
  });

  it("omits empty reference arrays", () => {
    const input = buildInput("reference", { ...DEFAULT_FORM, prompt: "x", media: { audio_urls: ["https://cdn.example.com/a.mp3"], image_urls: [] } });
    expect(input.audio_urls).toEqual(["https://cdn.example.com/a.mp3"]);
    expect(input).not.toHaveProperty("image_urls");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/studio-input.test.ts` → Expected: FAIL, cannot resolve `@/lib/studio-input`.

- [ ] **Step 3: Create `lib/studio-input.ts`**

```ts
import { DURATION, MODE_SPECS, type Mode, type MultiField, type SingleField } from "./modes";

export interface FormState {
  prompt: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  bitrate_mode: string;
  output_format: string;
  generate_audio: boolean;
  /** uploaded public URLs per media field; single fields use the first entry */
  media: Partial<Record<SingleField | MultiField, string[]>>;
}

export const DEFAULT_FORM: FormState = {
  prompt: "",
  duration: DURATION.default,
  resolution: "720p",
  aspect_ratio: "16:9",
  bitrate_mode: "high",
  output_format: "mp4",
  generate_audio: true,
  media: {},
};

export function buildInput(mode: Mode, form: FormState): Record<string, unknown> {
  const spec = MODE_SPECS[mode];
  const input: Record<string, unknown> = {
    resolution: form.resolution,
    bitrate_mode: form.bitrate_mode,
    generate_audio: form.generate_audio,
  };
  const prompt = form.prompt.trim();
  if (prompt) input.prompt = prompt;
  if (spec.duration) input.duration = form.duration;
  if (spec.aspectRatio) input.aspect_ratio = form.aspect_ratio;
  if (spec.outputFormat) input.output_format = form.output_format;
  for (const { field } of spec.single) {
    const url = form.media[field]?.[0];
    if (url) input[field] = url;
  }
  for (const field of Object.keys(spec.multi) as MultiField[]) {
    const urls = form.media[field] ?? [];
    if (urls.length > 0) input[field] = urls;
  }
  return input;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/studio-input.test.ts` → Expected: 3 tests PASS.

- [ ] **Step 5: Replace `app/globals.css`**

```css
@import "tailwindcss";

:root {
  color-scheme: dark;
}
```

- [ ] **Step 6: Create `components/LogoutButton.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-sm text-neutral-400 hover:text-white">
      Log out
    </button>
  );
}
```

- [ ] **Step 7: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seedance Studio",
  description: "Seedance 2.5 video generation via the Higgsfield API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
              Seedance Studio
            </Link>
            <Link href="/" className="text-sm text-neutral-400 hover:text-white">
              Studio
            </Link>
            <Link href="/gallery" className="text-sm text-neutral-400 hover:text-white">
              Gallery
            </Link>
            <div className="ml-auto">
              <LogoutButton />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `components/studio/MediaPicker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { UPLOAD_TYPES, type MediaKind } from "@/lib/modes";

interface Props {
  label: string;
  kind: MediaKind;
  max: number;
  required?: boolean;
  value: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  /** +n when uploads start, -1 as each finishes */
  onBusyChange: (delta: number) => void;
}

async function uploadFile(file: File): Promise<string> {
  const data = new FormData();
  data.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: data });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.url;
}

function Preview({ kind, url }: { kind: MediaKind; url: string }) {
  if (kind === "image") return <img src={url} alt="" className="h-24 w-24 rounded object-cover" />;
  if (kind === "video") return <video src={url} muted className="h-24 w-32 rounded object-cover" />;
  return <audio src={url} controls className="w-56" />;
}

export function MediaPicker({ label, kind, max, required, value, onChange, onBusyChange }: Props) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const room = max - value.length - pending;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    setError(files.length > picked.length ? `At most ${max} file(s)` : null);
    setPending((n) => n + picked.length);
    onBusyChange(picked.length);
    for (const file of picked) {
      try {
        const url = await uploadFile(file);
        onChange((prev) => [...prev, url]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPending((n) => n - 1);
        onBusyChange(-1);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-neutral-300">
        {label}
        {required && <span className="text-red-400"> *</span>}
        {max > 1 && <span className="text-neutral-500"> ({value.length}/{max})</span>}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {value.map((url) => (
          <div key={url} className="relative">
            <Preview kind={kind} url={url} />
            <button
              type="button"
              onClick={() => onChange((prev) => prev.filter((u) => u !== url))}
              className="absolute -right-2 -top-2 rounded-full bg-neutral-800 px-2 text-xs"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {pending > 0 && <span className="text-sm text-neutral-400">Uploading {pending}…</span>}
        {room > 0 && (
          <label className="cursor-pointer rounded-lg border border-dashed border-neutral-600 px-4 py-3 text-sm text-neutral-400 hover:border-neutral-400">
            + Add {kind}
            <input
              type="file"
              className="hidden"
              accept={UPLOAD_TYPES[kind].join(",")}
              multiple={max > 1}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 9: Create `components/studio/Studio.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MediaPicker } from "./MediaPicker";
import {
  ASPECT_RATIOS,
  BITRATE_MODES,
  DURATION,
  FIELD_KIND,
  MODES,
  MODE_SPECS,
  OUTPUT_FORMATS,
  RESOLUTIONS,
  type Mode,
  type MultiField,
  type SingleField,
} from "@/lib/modes";
import { DEFAULT_FORM, buildInput, type FormState } from "@/lib/studio-input";

export interface StudioPrefill {
  mode?: Mode;
  prompt?: string;
  video_url?: string;
}

const FIELD_LABELS: Record<SingleField | MultiField, string> = {
  image_url: "Start image",
  end_image_url: "End image (optional)",
  video_url: "Source video",
  image_urls: "Reference images",
  video_urls: "Reference videos",
  audio_urls: "Reference audio",
};

const selectClass = "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm";

export function Studio({ prefill }: { prefill: StudioPrefill }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(prefill.mode ?? "text");
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    prompt: prefill.prompt ?? "",
    media: prefill.video_url ? { video_url: [prefill.video_url] } : {},
  });
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const spec = MODE_SPECS[mode];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const mediaUpdater = (field: SingleField | MultiField) => (update: (prev: string[]) => string[]) =>
    setForm((f) => ({ ...f, media: { ...f.media, [field]: update(f.media[field] ?? []) } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input: buildInput(mode, form) }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        job?: { id: string };
        error?: string;
        errors?: { path: string; message: string }[];
      };
      if (!res.ok) {
        setErrors(body.errors?.map((x) => `${x.path || "input"}: ${x.message}`) ?? [body.error ?? `Request failed (${res.status})`]);
        return;
      }
      router.push(`/gallery#job-${body.job!.id}`);
    } catch {
      setErrors(["Network error, try again"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm ${m === mode ? "bg-white text-black" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          >
            {MODE_SPECS[m].label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-neutral-300">
          Prompt{spec.promptRequired ? <span className="text-red-400"> *</span> : " (optional)"}
        </span>
        <textarea
          value={form.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          rows={4}
          placeholder="Describe the shot, camera movement, mood…"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
      </label>

      {spec.single.map(({ field, required }) => (
        <MediaPicker
          key={`${mode}-${field}`}
          label={FIELD_LABELS[field]}
          kind={FIELD_KIND[field]}
          max={1}
          required={required}
          value={form.media[field] ?? []}
          onChange={mediaUpdater(field)}
          onBusyChange={(d) => setUploading((n) => n + d)}
        />
      ))}
      {(Object.entries(spec.multi) as [MultiField, number][]).map(([field, max]) => (
        <MediaPicker
          key={`${mode}-${field}`}
          label={FIELD_LABELS[field]}
          kind={FIELD_KIND[field]}
          max={max}
          value={form.media[field] ?? []}
          onChange={mediaUpdater(field)}
          onBusyChange={(d) => setUploading((n) => n + d)}
        />
      ))}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {spec.duration && (
          <label className="flex flex-col gap-1 text-sm">
            Duration: {form.duration}s
            <input
              type="range"
              min={DURATION.min}
              max={DURATION.max}
              value={form.duration}
              onChange={(e) => set("duration", Number(e.target.value))}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Resolution
          <select value={form.resolution} onChange={(e) => set("resolution", e.target.value)} className={selectClass}>
            {RESOLUTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {spec.aspectRatio && (
          <label className="flex flex-col gap-1 text-sm">
            Aspect ratio
            <select value={form.aspect_ratio} onChange={(e) => set("aspect_ratio", e.target.value)} className={selectClass}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Bitrate
          <select value={form.bitrate_mode} onChange={(e) => set("bitrate_mode", e.target.value)} className={selectClass}>
            {BITRATE_MODES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        {spec.outputFormat && (
          <label className="flex flex-col gap-1 text-sm">
            Format
            <select value={form.output_format} onChange={(e) => set("output_format", e.target.value)} className={selectClass}>
              {OUTPUT_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.generate_audio} onChange={(e) => set("generate_audio", e.target.checked)} />
          Generate audio
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        disabled={busy || uploading > 0}
        className="self-start rounded-lg bg-white px-6 py-2 font-medium text-black disabled:opacity-50"
      >
        {uploading > 0 ? "Waiting for uploads…" : busy ? "Submitting…" : "Generate"}
      </button>
    </form>
  );
}
```

- [ ] **Step 10: Replace `app/page.tsx`**

```tsx
import { Studio } from "@/components/studio/Studio";
import { isMode } from "@/lib/modes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const mode = one(sp.mode);
  const videoUrl = one(sp.video_url);
  return (
    <Studio
      // remount when opened from a different gallery action
      key={new URLSearchParams(sp as Record<string, string>).toString()}
      prefill={{
        mode: isMode(mode) ? mode : undefined,
        prompt: one(sp.prompt),
        video_url: videoUrl?.startsWith("https://") ? videoUrl : undefined,
      }}
    />
  );
}
```

- [ ] **Step 11: Verify in the browser**

Run: `npm run typecheck` → Expected: no errors. Then `npm run dev`, log in, and check:
- Each of the 5 tabs shows only its fields: Text shows aspect ratio and format; Image shows start and end image pickers and no aspect ratio; Reference shows three multi pickers; Edit shows source video and no duration; Extend shows source video and duration.
- Submitting Text with an empty prompt shows `prompt: Prompt is required`.
- Uploading a PNG in the Image tab shows a thumbnail. This requires real HF keys in `.env.local`; with placeholder keys the picker shows "Higgsfield API key is invalid or missing".
- `/?mode=extend&video_url=https://cdn.example.com/v.mp4&prompt=hi` opens the Extend tab prefilled.

- [ ] **Step 12: Commit**

```bash
git add lib/studio-input.ts tests/studio-input.test.ts components app/layout.tsx app/page.tsx app/globals.css
git commit -m "feat: add Studio page with all five Seedance modes"
```

---

### Task 9: Gallery UI

**Files:**
- Create: `app/gallery/page.tsx`, `components/gallery/Gallery.tsx`, `components/gallery/JobCard.tsx`

**Interfaces:**
- Consumes: `getDb`, `listJobs` (Task 4); `Job`, `isTerminal` (Task 4); `MODE_SPECS` (Task 2); `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, `GET /api/videos/:id` (Task 7); Studio query params (Task 8).
- Produces: `/gallery` page.

- [ ] **Step 1: Create `components/gallery/JobCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MODE_SPECS } from "@/lib/modes";
import { isTerminal, type Job, type JobStatus } from "@/lib/types";

const BADGE: Record<JobStatus, string> = {
  queued: "bg-neutral-700 text-neutral-200",
  in_progress: "bg-blue-900 text-blue-200",
  completed: "bg-green-900 text-green-200",
  failed: "bg-red-900 text-red-200",
  nsfw: "bg-orange-900 text-orange-200",
  canceled: "bg-neutral-800 text-neutral-400",
  error: "bg-red-900 text-red-200",
};

async function fetchJob(id: string): Promise<Job | null> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { job: Job }).job;
}

export function JobCard({ initial }: { initial: Job }) {
  const [job, setJob] = useState(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const terminal = isTerminal(job.status);

  // poll while running: 3s, growing to a 10s cap
  useEffect(() => {
    if (terminal) return;
    let alive = true;
    let delay = 3000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await fetchJob(job.id).catch(() => null);
      if (!alive) return;
      if (next) setJob(next);
      delay = Math.min(delay * 1.5, 10000);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job.id, terminal]);

  // a finished job whose download failed earlier: retry once per page load
  useEffect(() => {
    if (initial.status === "completed" && initial.remote_url && !initial.local_path) {
      void fetchJob(initial.id).then((next) => next && setJob(next));
    }
  }, [initial]);

  async function cancel() {
    setActionError(null);
    const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { job?: Job; error?: string };
    if (res.ok && body.job) setJob(body.job);
    else setActionError(body.error ?? `Cancel failed (${res.status})`);
  }

  const prompt = typeof job.params.prompt === "string" ? job.params.prompt : "";
  const videoSrc = job.local_path ? `/api/videos/${job.id}` : job.remote_url;
  const reuse = `/?${new URLSearchParams({ mode: job.mode, prompt })}`;

  return (
    <article id={`job-${job.id}`} className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-400">
          {MODE_SPECS[job.mode].label} · {new Date(job.created_at).toLocaleString()}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${BADGE[job.status]}`}>{job.status.replace("_", " ")}</span>
      </header>

      {job.status === "completed" && videoSrc ? (
        <video src={videoSrc} controls playsInline className="aspect-video w-full rounded-lg bg-black" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-950 text-sm text-neutral-500">
          {terminal ? "No video" : "Generating…"}
        </div>
      )}

      {prompt && <p className="line-clamp-3 text-sm text-neutral-300">{prompt}</p>}
      {job.error && <p className="text-sm text-red-400">{job.error}</p>}
      {actionError && <p className="text-sm text-red-400">{actionError}</p>}

      <footer className="flex flex-wrap gap-3 text-sm">
        {job.status === "queued" && (
          <button onClick={cancel} className="text-neutral-400 hover:text-white">
            Cancel
          </button>
        )}
        {job.status === "completed" && videoSrc && (
          <a href={videoSrc} download className="text-neutral-400 hover:text-white">
            Download
          </a>
        )}
        <Link href={reuse} className="text-neutral-400 hover:text-white">
          Reuse prompt
        </Link>
        {job.status === "completed" && job.remote_url && (
          <>
            <Link href={`/?mode=extend&video_url=${encodeURIComponent(job.remote_url)}`} className="text-neutral-400 hover:text-white">
              Extend
            </Link>
            <Link href={`/?mode=edit&video_url=${encodeURIComponent(job.remote_url)}`} className="text-neutral-400 hover:text-white">
              Edit
            </Link>
          </>
        )}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Create `components/gallery/Gallery.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";
import { JobCard } from "./JobCard";

export function Gallery({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <p className="text-neutral-400">
        No videos yet.{" "}
        <Link href="/" className="underline">
          Generate one
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <JobCard key={job.id} initial={job} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/gallery/page.tsx`**

```tsx
import { Gallery } from "@/components/gallery/Gallery";
import { getDb, listJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function GalleryPage() {
  return <Gallery jobs={listJobs(getDb())} />;
}
```

- [ ] **Step 4: Verify**

Run: `npm test`, `npm run typecheck`, `npm run build` → Expected: all pass.
In `npm run dev`, `/gallery` shows the empty state, or cards for jobs created in earlier tasks. A job with status `error` shows its message and a "Reuse prompt" link that opens the Studio prefilled.

- [ ] **Step 5: Commit**

```bash
git add app/gallery components/gallery
git commit -m "feat: add gallery with live job status"
```

---

### Task 10: End-to-end check with real keys and README

**Files:**
- Create: `README.md` (replace the generated one)

- [ ] **Step 1: Configure real keys** in `.env.local` (`HF_API_KEY_ID`, `HF_API_KEY_SECRET` from console.higgsfield.ai).

- [ ] **Step 2: Cheapest real run.** In Studio → Text: prompt "a paper boat drifting on a calm lake at sunrise", duration 4, 480p, bitrate standard, audio off → Generate.
Expected: redirected to `/gallery`; the card goes `queued` → `in progress` → `completed`, the video plays from `/api/videos/<id>`, and `storage/videos/<id>.mp4` exists.

- [ ] **Step 3: Extend the result.** Click "Extend" on that card, enter a prompt with duration 4 and 480p, then Generate. Expected: a new card completes.

- [ ] **Step 4: Image upload path.** In Image → Video, upload a small JPEG with duration 4 and 480p. Expected: the thumbnail appears after upload and the job completes.

- [ ] **Step 5: Write `README.md`**

````markdown
# Seedance Studio

Private web app for generating ByteDance Seedance 2.5 videos through the Higgsfield API
(text, image, reference, edit and extend modes).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Open http://localhost:3000 and sign in with `APP_PASSWORD`.

## Data

- Jobs: SQLite at `data/app.db` (override with `DB_PATH`)
- Finished videos: `storage/videos/`

Both folders are gitignored — back them up if you care about the history.

## Scripts

- `npm test` — unit tests (Vitest)
- `npm run typecheck`
- `npm run build && npm start` — production
````

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```
