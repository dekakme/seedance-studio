import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertJob, openDb, type Db } from "@/lib/db";
import type { StatusResult } from "@/lib/higgsfield";
import { JOB_TIMEOUT_MS, refreshJob, type RefreshDeps } from "@/lib/jobs";

type Download = RefreshDeps["download"];
const STATUS_URL = "https://api.higgsfield.ai/requests/r1/status";
let db: Db;

function deps(status: StatusResult | Error, download: Download = vi.fn<Download>(async (_url, name) => name)) {
  const getStatus = vi.fn(async () => {
    if (status instanceof Error) throw status;
    return status;
  });
  return { db, hf: { getStatus }, download };
}

beforeEach(() => {
  db = openDb(":memory:");
  insertJob(db, { id: "j1", mode: "text", params: { prompt: "x", output_format: "mov" }, status: "queued", status_url: STATUS_URL });
});

describe("refreshJob", () => {
  it("returns null for unknown jobs", async () => {
    expect(await refreshJob(deps({ status: "queued", videoUrl: null, error: null }), "zzz")).toBeNull();
  });

  it("stores in-progress status", async () => {
    const j = await refreshJob(deps({ status: "in_progress", videoUrl: null, error: null }), "j1");
    expect(j?.status).toBe("in_progress");
  });

  it("downloads the video once completed, using the output format extension", async () => {
    const d = deps({ status: "completed", videoUrl: "https://cdn.example.com/v.mov", error: null });
    const j = await refreshJob(d, "j1");
    expect(d.download).toHaveBeenCalledWith("https://cdn.example.com/v.mov", "j1.mov");
    expect(j).toMatchObject({ status: "completed", remote_url: "https://cdn.example.com/v.mov", local_path: "j1.mov" });
  });

  it("keeps the job completed when the download fails", async () => {
    const failing = vi.fn<Download>(async () => {
      throw new Error("boom");
    });
    const j = await refreshJob(deps({ status: "completed", videoUrl: "https://cdn.example.com/v.mov", error: null }, failing), "j1");
    expect(j).toMatchObject({ status: "completed", local_path: null });
  });

  it("records the reason for nsfw jobs", async () => {
    const j = await refreshJob(deps({ status: "nsfw", videoUrl: null, error: null }), "j1");
    expect(j).toMatchObject({ status: "nsfw", error: "nsfw" });
  });

  it("does not poll terminal jobs", async () => {
    const d = deps({ status: "failed", videoUrl: null, error: "bad prompt" });
    expect((await refreshJob(d, "j1"))?.error).toBe("bad prompt");
    await refreshJob(d, "j1");
    expect(d.hf.getStatus).toHaveBeenCalledTimes(1);
  });

  it("leaves the job untouched when the status call fails", async () => {
    const j = await refreshJob(deps(new Error("network")), "j1");
    expect(j?.status).toBe("queued");
  });

  it("times out jobs that never finish", async () => {
    insertJob(db, { id: "old", mode: "text", params: {}, status: "in_progress", status_url: STATUS_URL }, new Date(Date.now() - JOB_TIMEOUT_MS - 1000));
    const d = deps({ status: "in_progress", videoUrl: null, error: null });
    const j = await refreshJob(d, "old");
    expect(j).toMatchObject({ status: "error", error: "Timed out waiting for Higgsfield" });
  });
});
