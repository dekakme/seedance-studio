import { NextResponse } from "next/server";
import { describeError, getHiggsfield } from "@/lib/higgsfield";
import { MAX_UPLOAD_BYTES, isAllowedUploadType } from "@/lib/modes";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
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
    const { httpStatus, message } = describeError(err);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
