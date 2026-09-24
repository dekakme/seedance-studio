import { higgsfieldCredentials } from "./env";
import { MODE_PATHS, type Mode } from "./modes";

export const HF_BASE_URL = "https://api.higgsfield.ai";
const REQUEST_TIMEOUT_MS = 30_000;

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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  shared ??= createHiggsfieldClient(higgsfieldCredentials());
  return shared;
}

/** Maps any error to the HTTP status and message our API returns to the browser. */
export function describeError(err: unknown): { httpStatus: number; message: string } {
  if (err instanceof HiggsfieldError) {
    if (err.status === 401 || err.status === 403) {
      return { httpStatus: 502, message: "Higgsfield API key is invalid or missing" };
    }
    if (err.status === 402) return { httpStatus: 402, message: "Not enough Higgsfield credits" };
    if (err.status === 429) return { httpStatus: 429, message: "Rate limited by Higgsfield, try again shortly" };
    if (err.status === 400 || err.status === 422) return { httpStatus: 422, message: err.message };
    if (err.status === 0 || err.status >= 500) return { httpStatus: 502, message: "Higgsfield is unavailable, try again" };
    return { httpStatus: 502, message: err.message };
  }
  return { httpStatus: 500, message: err instanceof Error ? err.message : "Unexpected error" };
}
