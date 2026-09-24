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
