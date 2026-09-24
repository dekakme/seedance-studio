import { Studio } from "@/components/studio/Studio";
import { isMode } from "@/lib/modes";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const mode = one(sp.mode);
  const prompt = one(sp.prompt);
  const videoUrl = one(sp.video_url);
  return (
    <Studio
      // remount when opened from a different gallery action
      key={`${mode}|${prompt}|${videoUrl}`}
      prefill={{
        mode: isMode(mode) ? mode : undefined,
        prompt,
        video_url: videoUrl?.startsWith("https://") ? videoUrl : undefined,
      }}
    />
  );
}
