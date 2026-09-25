import { describe, expect, it, vi } from "vitest";
import { createHiggsfieldClient, describeError, HiggsfieldError } from "@/lib/higgsfield";

const BASE = "https://api.higgsfield.ai";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}
const client = (f: typeof fetch) => createHiggsfieldClient({ keyId: "kid", keySecret: "ksec", fetch: f });

describe("higgsfield client", () => {
  it("submits to the mode endpoint with the key header and a timeout", async () => {
    const f = mockFetch(
      json({ status: "queued", request_id: "r1", status_url: `${BASE}/requests/r1/status`, cancel_url: `${BASE}/requests/r1/cancel` }),
    );
    const r = await client(f).submit("extend", { prompt: "go" });
    expect(r.request_id).toBe("r1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${BASE}/bytedance/seedance-2.5/video-extend`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Key kid:ksec");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init?.body as string)).toEqual({ prompt: "go" });
  });

  it("maps a completed status to the video url", async () => {
    const f = mockFetch(json({ status: "completed", request_id: "r1", video: { url: "https://cdn.example.com/v.mp4" }, error: null }));
    await expect(client(f).getStatus(`${BASE}/requests/r1/status`)).resolves.toEqual({
      status: "completed",
      videoUrl: "https://cdn.example.com/v.mp4",
      error: null,
    });
  });

  it("follows status urls on other Higgsfield hosts", async () => {
    const f = mockFetch(json({ status: "in_progress", request_id: "r1" }));
    await expect(client(f).getStatus("https://platform.higgsfield.ai/requests/r1/status")).resolves.toMatchObject({
      status: "in_progress",
    });
  });

  it("refuses to send the key to a non-Higgsfield url", async () => {
    const f = mockFetch();
    const c = client(f);
    for (const url of [
      "https://evil.example.com/requests/r1/status",
      "https://higgsfield.ai.evil.com/requests/r1/status",
      "http://platform.higgsfield.ai/requests/r1/status",
    ]) {
      await expect(c.getStatus(url)).rejects.toThrow(/non-Higgsfield/);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("throws HiggsfieldError with the detail message", async () => {
    const f = mockFetch(json({ detail: [{ loc: ["body", "prompt"], msg: "Field required" }] }, 422));
    const err = await client(f).submit("text", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiggsfieldError);
    expect((err as HiggsfieldError).status).toBe(422);
    expect((err as HiggsfieldError).message).toBe("body.prompt: Field required");
  });

  it("reports whether a cancel was accepted", async () => {
    const f = mockFetch(new Response(null, { status: 202 }), json({ detail: "already running" }, 400));
    const c = client(f);
    await expect(c.cancel(`${BASE}/requests/r1/cancel`)).resolves.toBe(true);
    await expect(c.cancel(`${BASE}/requests/r1/cancel`)).resolves.toBe(false);
  });

  it("uploads a file without sending credentials to storage", async () => {
    const f = mockFetch(
      json({
        public_url: "https://cdn.example.com/in.png",
        upload_url: "https://storage.example.com/put",
        content_type: "image/png",
        upload_headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" },
      }),
      new Response(null, { status: 200 }),
    );
    const url = await client(f).uploadFile(new Blob(["png"], { type: "image/png" }), "image/png");
    expect(url).toBe("https://cdn.example.com/in.png");
    expect(f.mock.calls[0][0]).toBe(`${BASE}/files/generate-upload-url`);
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ content_type: "image/png" });
    const [putUrl, putInit] = f.mock.calls[1];
    expect(putUrl).toBe("https://storage.example.com/put");
    expect(putInit?.method).toBe("PUT");
    expect(putInit?.headers).toEqual({ "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" });
  });
});

describe("describeError", () => {
  it("hides auth failures behind a clear message", () => {
    expect(describeError(new HiggsfieldError(401, "bad"))).toEqual({
      httpStatus: 502,
      message: "Higgsfield API key is invalid or missing",
    });
  });
  it("explains missing credits", () => {
    expect(describeError(new HiggsfieldError(402, "x"))).toEqual({
      httpStatus: 402,
      message: "Not enough Higgsfield credits",
    });
  });
  it("passes validation messages through", () => {
    expect(describeError(new HiggsfieldError(422, "prompt: required"))).toEqual({ httpStatus: 422, message: "prompt: required" });
  });
  it("flags rate limits", () => {
    expect(describeError(new HiggsfieldError(429, "x")).httpStatus).toBe(429);
  });
  it("reports unknown errors as 500 with their message", () => {
    expect(describeError(new Error("Missing environment variable HF_CREDENTIALS"))).toEqual({
      httpStatus: 500,
      message: "Missing environment variable HF_CREDENTIALS",
    });
  });
});
