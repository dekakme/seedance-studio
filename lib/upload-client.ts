import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, type MediaKind } from "./modes";

export function kindOf(contentType: string): MediaKind | null {
  for (const [kind, types] of Object.entries(UPLOAD_TYPES)) {
    if ((types as readonly string[]).includes(contentType)) return kind as MediaKind;
  }
  return null;
}

export function acceptFor(kinds: MediaKind[]): string {
  return kinds.flatMap((k) => UPLOAD_TYPES[k]).join(",");
}

/**
 * Uploads through /api/uploads (which forwards to Higgsfield storage) and returns the public URL.
 * With `trim`, the server cuts the video to [start, end) seconds first.
 */
export async function uploadMedia(file: File, trim?: { start: number; end: number }): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 200 MB`);
  const data = new FormData();
  data.append("file", file);
  if (trim) {
    data.append("trim_start", String(trim.start));
    data.append("trim_end", String(trim.end));
  }
  const res = await fetch("/api/uploads", { method: "POST", body: data });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.url;
}
