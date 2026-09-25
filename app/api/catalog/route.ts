import { NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog-server";

/** The synced model catalog (names, pricing text, input schemas) for the composer's generic form. */
export function GET() {
  return NextResponse.json({ models: CATALOG }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
