import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadVideo } from "@/lib/storage";

let dir: string;
beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "seedance-"));
});
afterEach(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true });
});

describe("downloadVideo", () => {
  it("writes the body to <dir>/<fileName>", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response("video-bytes"));
    await expect(downloadVideo("https://cdn.example.com/v.mp4", "job1.mp4", { dir, fetch: f })).resolves.toBe("job1.mp4");
    expect(await fs.promises.readFile(path.join(dir, "job1.mp4"), "utf8")).toBe("video-bytes");
  });

  it("leaves no file behind on HTTP errors", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(downloadVideo("https://cdn.example.com/v.mp4", "job1.mp4", { dir, fetch: f })).rejects.toThrow("HTTP 403");
    expect(await fs.promises.readdir(dir)).toEqual([]);
  });

  it("rejects unsafe file names", async () => {
    await expect(
      downloadVideo("https://cdn.example.com/v.mp4", "../x.mp4", { dir, fetch: vi.fn<typeof fetch>() }),
    ).rejects.toThrow(/Invalid/);
  });
});
