// Seedance 2.5 text-to-video example using the official Higgsfield SDK.
// Run with: npm run example
import { APIError, TimeoutError, config, higgsfield } from "@higgsfield/client/v2";

// Load HF_CREDENTIALS ("key-id:key-secret") from .env.local without printing it.
try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to variables already present in the environment
}

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS is not set. Add it to .env.local as key-id:key-secret.");
  process.exit(1);
}

config({
  credentials: process.env.HF_CREDENTIALS,
  // video generation can take several minutes; the SDK default is 5
  maxPollTime: 20 * 60 * 1000,
});

async function main(): Promise<number> {
  console.log("Submitting Seedance 2.5 text-to-video request…");
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  // the SDK types omit "canceled", but the API can return it
  const status = result.status as string;
  console.log(`Request ${result.request_id} finished with status: ${status}`);

  if (status === "completed" && result.video?.url) {
    console.log(`Video URL: ${result.video.url}`);
    return 0;
  }
  if (status === "completed") {
    console.error("Request completed but no video URL was returned.");
  } else if (status === "nsfw") {
    console.error("Request was blocked by content moderation (nsfw). No video was generated.");
  } else {
    console.error(`Generation did not succeed (${status}). No video was generated.`);
  }
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof TimeoutError) {
      console.error(`Timed out waiting for the video: ${err.message}`);
    } else if (err instanceof APIError) {
      console.error(`Higgsfield API error (${err.statusCode ?? "?"}): ${err.message}`);
    } else {
      console.error("Unexpected error:", err instanceof Error ? err.message : err);
    }
    process.exit(1);
  });
