export const MODES = [
  "text",
  "image",
  "reference",
  "edit",
  "extend",
  "kling_std_text",
  "kling_std_image",
  "kling_pro_text",
  "kling_pro_image",
  "kling_4k_text",
  "kling_4k_image",
  "genjutsu",
  "genjutsu_swap",
] as const;
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export type ModelFamily = "seedance" | "kling" | "genjutsu";
export const MODEL_LABEL: Record<ModelFamily, string> = {
  seedance: "Seedance 2.5",
  kling: "Kling 3.0",
  genjutsu: "Higgsfield Genjutsu",
};

export const MODE_PATHS: Record<Mode, string> = {
  text: "/bytedance/seedance-2.5/text-to-video",
  image: "/bytedance/seedance-2.5/image-to-video",
  reference: "/bytedance/seedance-2.5/reference-to-video",
  edit: "/bytedance/seedance-2.5/video-edit",
  extend: "/bytedance/seedance-2.5/video-extend",
  kling_std_text: "/kling-video/v3.0/std/text-to-video",
  kling_std_image: "/kling-video/v3.0/std/image-to-video",
  kling_pro_text: "/kling-video/v3.0/pro/text-to-video",
  kling_pro_image: "/kling-video/v3.0/pro/image-to-video",
  kling_4k_text: "/kling-video/v3.0/4k/text-to-video",
  kling_4k_image: "/kling-video/v3.0/4k/image-to-video",
  genjutsu: "/higgsfield/genjutsu/motion-transfer/v1.0",
  genjutsu_swap: "/higgsfield/genjutsu/object-swap/v1.0",
};

export const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;
export const KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const RESOLUTIONS = ["480p", "720p"] as const;
export const BITRATE_MODES = ["standard", "high"] as const;
export const OUTPUT_FORMATS = ["mp4", "mov"] as const;
/** Seedance duration range; also the composer's default duration. */
export const DURATION = { min: 4, max: 30, default: 5 } as const;
const KLING_DURATION = { min: 3, max: 15, default: 5 } as const;

export type SingleField = "image_url" | "end_image_url" | "last_image_url" | "video_url";
export type MultiField = "image_urls" | "video_urls" | "audio_urls";

export interface ModeSpec {
  model: ModelFamily;
  label: string;
  promptRequired: boolean;
  promptMax?: number;
  duration: { min: number; max: number; default: number } | null;
  aspectRatios: readonly [string, ...string[]] | null;
  resolution: boolean;
  bitrate: boolean;
  outputFormat: boolean;
  /** Seedance takes generate_audio (boolean), Kling takes sound ("on" | "off") */
  audio: "generate_audio" | "sound" | null;
  cfgScale: boolean;
  single: { field: SingleField; required: boolean }[];
  multi: Partial<Record<MultiField, { min?: number; max: number }>>;
}

function seedance(label: string, extra: Partial<ModeSpec>): ModeSpec {
  return {
    model: "seedance",
    label,
    promptRequired: true,
    duration: DURATION,
    aspectRatios: null,
    resolution: true,
    bitrate: true,
    outputFormat: false,
    audio: "generate_audio",
    cfgScale: false,
    single: [],
    multi: {},
    ...extra,
  };
}

function kling(tier: "Std" | "Pro" | "4K", fromImage: boolean): ModeSpec {
  return {
    model: "kling",
    label: `${fromImage ? "Image" : "Text"} → Video (${tier})`,
    promptRequired: !fromImage,
    duration: KLING_DURATION,
    aspectRatios: fromImage ? null : KLING_ASPECT_RATIOS,
    resolution: false,
    bitrate: false,
    outputFormat: false,
    audio: "sound",
    cfgScale: true,
    single: fromImage
      ? [
          { field: "image_url", required: true },
          { field: "last_image_url", required: false },
        ]
      : [],
    multi: {},
  };
}

/** Motion Transfer and Object Swap share one input schema. */
function genjutsu(label: string): ModeSpec {
  return {
    model: "genjutsu",
    label,
    promptRequired: false,
    promptMax: 10_000,
    duration: null,
    aspectRatios: null,
    resolution: true,
    bitrate: false,
    outputFormat: false,
    audio: null,
    cfgScale: false,
    single: [{ field: "video_url", required: true }],
    multi: { image_urls: { min: 1, max: 8 } },
  };
}

// the source video counts toward Seedance's 10-video limit, hence 9 extra videos for edit/extend
const SEEDANCE_EDIT_REFS = { image_urls: { max: 30 }, video_urls: { max: 9 }, audio_urls: { max: 10 } };

export const MODE_SPECS: Record<Mode, ModeSpec> = {
  text: seedance("Text → Video", { aspectRatios: ASPECT_RATIOS, outputFormat: true }),
  image: seedance("Image → Video", {
    promptRequired: false,
    single: [
      { field: "image_url", required: true },
      { field: "end_image_url", required: false },
    ],
  }),
  reference: seedance("Reference → Video", {
    aspectRatios: ASPECT_RATIOS,
    multi: { image_urls: { max: 30 }, video_urls: { max: 10 }, audio_urls: { max: 10 } },
  }),
  edit: seedance("Edit Video", { duration: null, single: [{ field: "video_url", required: true }], multi: SEEDANCE_EDIT_REFS }),
  extend: seedance("Extend Video", { single: [{ field: "video_url", required: true }], multi: SEEDANCE_EDIT_REFS }),
  kling_std_text: kling("Std", false),
  kling_std_image: kling("Std", true),
  kling_pro_text: kling("Pro", false),
  kling_pro_image: kling("Pro", true),
  kling_4k_text: kling("4K", false),
  kling_4k_image: kling("4K", true),
  genjutsu: genjutsu("Motion Transfer"),
  genjutsu_swap: genjutsu("Object Swap"),
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
  last_image_url: "image",
  video_url: "video",
  image_urls: "image",
  video_urls: "video",
  audio_urls: "audio",
};

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function isAllowedUploadType(contentType: string): boolean {
  return Object.values(UPLOAD_TYPES).some((types) => (types as readonly string[]).includes(contentType));
}
