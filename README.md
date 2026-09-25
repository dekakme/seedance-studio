# Seedance Studio

Private web app for generating ByteDance **Seedance 2.5** videos through the
[Higgsfield API](https://docs.higgsfield.ai): text → video, image → video,
reference → video, video edit and video extend.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and sign in with `APP_PASSWORD`.

| Variable | Purpose |
|----------|---------|
| `HF_CREDENTIALS` | Higgsfield API key as `key-id:key-secret` ([console](https://console.higgsfield.ai)) |
| `APP_PASSWORD` | Shared password for the login page |
| `SESSION_SECRET` | ≥32 random characters used to sign the session cookie |
| `DB_PATH` | Optional, defaults to `data/app.db` |

Credentials stay on the server: the browser only talks to this app's `/api/*` routes.

## How it works

- `POST /api/jobs` validates the input per mode (`lib/schemas.ts`), submits it to
  Higgsfield and stores the `request_id` in SQLite. A `client_token` per submit
  makes double clicks and retries return the same job instead of paying twice.
- The gallery polls `GET /api/jobs/:id` (2 s → 10 s backoff with jitter). Each poll
  refreshes status from Higgsfield; jobs still running after 60 minutes are marked
  as timed out. Finished videos are downloaded to `storage/videos/`.
- Uploaded images, videos and audio go through `POST /api/uploads` to Higgsfield
  storage, and their public URLs are passed to the model.

## Costs

Every generation is billed by Higgsfield. Seedance 2.5 at 480p/720p costs about
$0.0214 per 1,000 video tokens. That is roughly $0.82 for 4 s at 480p and $2.31
for 5 s at 720p (16:9).

## Data

- Jobs: SQLite at `data/app.db`
- Finished videos: `storage/videos/`

Both folders are gitignored. Back them up if you want to keep the history.

## Scripts

- `npm test`: unit tests (Vitest)
- `npm run typecheck`
- `npm run example`: one-off SDK example (`index.ts`); makes a billable request
- `npm run build && npm start`: production
