// Prompt tags (@Image1, @Video1, @Audio1) refer to reference media by kind and upload order:
// @Image2 is the second entry of image_urls, @Video1 the first of video_urls, and so on.
import type { MediaKind } from "./modes";

export interface RefItem {
  kind: MediaKind;
  url: string;
}

const LABEL: Record<MediaKind, string> = { image: "Image", video: "Video", audio: "Audio" };
const TAG_PATTERN = /@(Image|Video|Audio)(\d+)/g;

/** 1-based position of refs[index] among refs of the same kind. */
function positionOf(refs: RefItem[], index: number): number {
  const kind = refs[index].kind;
  return refs.slice(0, index + 1).filter((r) => r.kind === kind).length;
}

export function tagAt(refs: RefItem[], index: number): string {
  return `@${LABEL[refs[index].kind]}${positionOf(refs, index)}`;
}

export function refTags(refs: RefItem[]): (RefItem & { tag: string })[] {
  return refs.map((r, i) => ({ ...r, tag: tagAt(refs, i) }));
}

/** Removes refs[index]'s tag from the prompt and shifts later tags of the same kind down by one. */
export function removeRefFromPrompt(prompt: string, refs: RefItem[], index: number): string {
  const label = LABEL[refs[index].kind];
  const n = positionOf(refs, index);
  return prompt
    .replace(new RegExp(`@${label}(\\d+)`, "g"), (match, digits: string) => {
      const k = Number(digits);
      if (k === n) return "\u0000";
      return k > n ? `@${label}${k - 1}` : match;
    })
    .replace(/\u0000 ?/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function unknownTags(prompt: string, refs: RefItem[]): string[] {
  const known = new Set(refTags(refs).map((t) => t.tag));
  return [...new Set([...prompt.matchAll(TAG_PATTERN)].map((m) => m[0]))].filter((t) => !known.has(t));
}

export function splitByTags(text: string): { text: string; tag: boolean }[] {
  const out: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_PATTERN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), tag: false });
    out.push({ text: m[0], tag: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tag: false });
  return out;
}
