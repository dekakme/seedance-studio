import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { MAX_UPLOAD_BYTES, isAllowedUploadType } from "@/lib/modes";

export async function POST(request: NextRequest) {
  // excluded from proxy.ts so large videos are streamed, not buffered — so authenticate here
  if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Could not read the uploaded file" }, { status: 400 });
  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 200 MB" }, { status: 413 });
  }
  try {
    const url = await getHiggsfield().uploadFile(file, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    console.warn(`[uploads] ${file.name} (${file.type}, ${file.size} bytes) failed:`, err);
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
