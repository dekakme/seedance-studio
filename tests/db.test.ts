import { beforeEach, describe, expect, it } from "vitest";
import { deleteJob, findJobByClientToken, getJob, insertJob, listJobs, openDb, updateJob, type Db } from "@/lib/db";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("jobs repository", () => {
  it("round-trips params as JSON", () => {
    insertJob(db, { id: "a", mode: "text", params: { prompt: "hi", duration: 5 }, status: "queued" });
    expect(getJob(db, "a")).toMatchObject({
      id: "a",
      mode: "text",
      params: { prompt: "hi", duration: 5 },
      status: "queued",
      client_token: null,
      request_id: null,
      local_path: null,
    });
  });

  it("returns null for unknown ids", () => {
    expect(getJob(db, "nope")).toBeNull();
  });

  it("lists newest first", () => {
    insertJob(db, { id: "old", mode: "text", params: {}, status: "queued" }, new Date("2026-01-01T00:00:00Z"));
    insertJob(db, { id: "new", mode: "text", params: {}, status: "queued" }, new Date("2026-02-01T00:00:00Z"));
    expect(listJobs(db).map((j) => j.id)).toEqual(["new", "old"]);
  });

  it("updates only the given fields and bumps updated_at", () => {
    insertJob(db, { id: "a", mode: "text", params: {}, status: "queued" }, new Date("2026-01-01T00:00:00Z"));
    const j = updateJob(
      db,
      "a",
      { status: "completed", remote_url: "https://cdn.example.com/v.mp4" },
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(j).toMatchObject({
      status: "completed",
      remote_url: "https://cdn.example.com/v.mp4",
      error: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
  });

  it("deletes a job", () => {
    insertJob(db, { id: "a", mode: "text", params: {}, status: "queued" });
    expect(deleteJob(db, "a")).toBe(true);
    expect(getJob(db, "a")).toBeNull();
    expect(deleteJob(db, "a")).toBe(false);
  });

  it("finds a job by client token and rejects duplicates", () => {
    insertJob(db, { id: "a", mode: "text", params: {}, status: "queued", client_token: "tok-1" });
    expect(findJobByClientToken(db, "tok-1")?.id).toBe("a");
    expect(findJobByClientToken(db, "tok-2")).toBeNull();
    expect(() => insertJob(db, { id: "b", mode: "text", params: {}, status: "queued", client_token: "tok-1" })).toThrow();
  });
});
