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
