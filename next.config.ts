import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary relative to its own folder, so it must not be bundled
  serverExternalPackages: ["better-sqlite3", "ffmpeg-static"],
};

export default nextConfig;
