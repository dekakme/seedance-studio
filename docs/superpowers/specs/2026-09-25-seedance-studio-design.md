# Seedance Studio — Design

**Date:** 2026-09-25
**Status:** Approved (brainstorming)

## Goal

A private web app for one person or a small team to generate videos with
ByteDance **Seedance 2.5** through the **Higgsfield API**. All five Seedance 2.5
modes are exposed, results are kept in a local gallery, and API keys never
reach the browser.

## Non-goals (v1)

- Multi-user accounts, per-user quotas, credits or payments
- Webhooks (require a public URL)
- Production deployment scripts

## Stack

- Next.js (App Router, TypeScript), Tailwind CSS
- SQLite via `better-sqlite3` (single file `data/app.db`)
- Zod for input validation
- Vitest for unit tests
- Location: `C:\laragon\www\seedance` (standalone git repo)

## Configuration (`.env.local`)

| Var | Purpose |
|-----|---------|
| `HF_API_KEY_ID` | Higgsfield key id |
| `HF_API_KEY_SECRET` | Higgsfield key secret |
| `APP_PASSWORD` | Shared login password |
| `SESSION_SECRET` | HMAC secret for the session cookie (≥32 chars) |

A `.env.example` lists these without values. The app refuses to start API
calls (clear error) when HF keys are missing.

## Higgsfield API facts (from docs.higgsfield.ai)

- Base URL `https://api.higgsfield.ai`
- Auth header: `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`
- Submit returns `{ status: "queued", request_id, status_url, cancel_url }`
- Status values: `queued`, `in_progress` (non-terminal); `completed`,
  `failed`, `nsfw`, `canceled` (terminal)
- Completed payload: `{ status: "completed", request_id, video: { url } }`
- Cancel: `POST cancel_url` → 202, or 400 once processing started
- Uploads: `POST /files/generate-upload-url` with `{ content_type }` →
  `{ upload_url, public_url, ...headers }`; client `PUT`s the file to
  `upload_url` (no Higgsfield credentials); `public_url` is then passed to a
  model. `upload_url` expires after 1 hour. Images: jpeg, png, webp, gif.
- Always use the returned `status_url` / `cancel_url`, never build them.

### Seedance 2.5 endpoints and inputs

Shared optional fields: `resolution` (`480p`|`720p`, default `720p`),
`bitrate_mode` (`standard`|`high`, default `high`), `generate_audio`
(bool, default `true`).

| Mode | Path | Required | Extra optional |
|------|------|----------|----------------|
| Text | `/bytedance/seedance-2.5/text-to-video` | `prompt` | `duration` 4–30 (5), `aspect_ratio`, `output_format` (`mp4`\|`mov`) |
| Image | `/bytedance/seedance-2.5/image-to-video` | `image_url` | `prompt`, `duration`, `end_image_url` |
| Reference | `/bytedance/seedance-2.5/reference-to-video` | `prompt` + ≥1 non-empty of `image_urls` (≤30), `video_urls` (≤10), `audio_urls` (≤10) | `duration`, `aspect_ratio` |
| Edit | `/bytedance/seedance-2.5/video-edit` | `prompt`, `video_url` | `image_urls` ≤30, `video_urls` ≤9, `audio_urls` ≤10 |
| Extend | `/bytedance/seedance-2.5/video-extend` | `prompt`, `video_url` | `duration`, `image_urls` ≤30, `video_urls` ≤9, `audio_urls` ≤10 |

`aspect_ratio` ∈ `16:9, 4:3, 1:1, 3:4, 9:16, 21:9` (default `16:9`).
Edit/extend: source video counts toward the 10-video limit; total media ≤50.

## Architecture

```
browser ──► Next.js pages (Studio, Gallery, Login)
   │
   ├─► /api/uploads (multipart) ──► lib/higgsfield.uploadFile
   │      (server gets upload_url, PUTs the file, returns public_url;
   │       proxied server-side to avoid storage-bucket CORS issues)
   ├─► /api/jobs (POST) ──► lib/schemas (Zod) ──► lib/higgsfield.submit ──► db
   ├─► /api/jobs (GET list)  ──► db
   ├─► /api/jobs/:id (GET) ──► lib/jobs.refresh ──► higgsfield.status
   │                                 └─ on completed: lib/storage.download
   ├─► /api/jobs/:id/cancel ──► higgsfield.cancel
   └─► /api/videos/:id ──► stream storage/videos/<id>.<ext>
```

### Units

- **`lib/higgsfield.ts`** — the only module that talks to Higgsfield.
  `submit(mode, input)`, `getStatus(statusUrl)`, `cancel(cancelUrl)`,
  `generateUploadUrl(contentType)`, `uploadFile(blob, contentType)`. Throws `HiggsfieldError { status, message }`.
  Takes `fetch` as an injectable dependency for tests.
- **`lib/schemas.ts`** — one Zod schema per mode encoding the table above;
  `parseJobInput(mode, body)` returns the exact payload sent to Higgsfield.
- **`lib/db.ts`** — opens SQLite, runs the idempotent `CREATE TABLE IF NOT
  EXISTS`, and exposes `insertJob`, `getJob`, `listJobs`, `updateJob`.
- **`lib/jobs.ts`** — `refreshJob(id)`: if non-terminal, poll status, map it,
  persist; on `completed` download the video once, then set `local_path`.
- **`lib/storage.ts`** — `downloadVideo(url, id)` into `storage/videos/`
  (gitignored), writing to a temp file and renaming on success.
- **`lib/auth.ts`** — sign and verify an HMAC session cookie (`httpOnly`,
  `sameSite=lax`, 30 days); constant-time password compare.
- **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) — redirects unauthenticated pages to `/login`, returns
  401 for `/api/*` (except `/api/login`).

### Data model

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,          -- uuid generated locally
  mode TEXT NOT NULL,           -- text|image|reference|edit|extend
  params TEXT NOT NULL,         -- JSON payload sent to Higgsfield
  request_id TEXT,
  status_url TEXT,
  cancel_url TEXT,
  status TEXT NOT NULL,         -- queued|in_progress|completed|failed|nsfw|canceled|error
  error TEXT,
  remote_url TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,     -- ISO-8601
  updated_at TEXT NOT NULL      -- ISO-8601
);
```

`error` status = the submit itself failed (e.g. 422); the Higgsfield message
is kept in `error`.

## UI

- **Login** — a single password field.
- **Studio `/`** — five mode tabs; each tab renders only its fields. Media
  pickers upload via `/api/uploads` and show thumbnails, progress, and remove
  buttons. They enforce the per-mode count limits before submit. A cost-aware
  default of 5 s / 720p is used. Submitting redirects to the job card.
- **Gallery `/gallery`** — a newest-first grid of job cards with a status
  badge, the video player when done, download, "reuse prompt" (opens Studio
  prefilled), and "Extend" / "Edit" actions (open Studio with `video_url` =
  that video's remote URL). Non-terminal cards poll `/api/jobs/:id` with
  backoff of 3 s, growing to a 10 s cap. A cancel button appears while the job is queued.

## Error handling

- Higgsfield 401 → "API key is invalid or missing". 422 → shows the field
  message. 429 → "Rate limited, try again shortly". 5xx/network → a generic
  retryable message.
- Validation errors from Zod are returned as 400 with field paths and shown
  inline.
- `nsfw` / `failed` / `canceled` render as terminal badges with the reason.
- A download failure leaves the job `completed` with `local_path` null. The
  gallery falls back to `remote_url`, and the next refresh retries the download.

## Testing

- Vitest unit tests for `lib/schemas.ts` (each mode: valid, missing
  required, over-limit arrays, out-of-range duration) and `lib/higgsfield.ts`
  (auth header, submit path per mode, error mapping) with mocked fetch.
- `lib/jobs.ts` refresh logic with a fake higgsfield client and an in-memory DB.
- Manual end-to-end with real keys: text-to-video, 4 s, 480p,
  `generate_audio=false` (the cheapest run).
