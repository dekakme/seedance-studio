import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, checkPassword, sessionSecret, signSession } from "@/lib/auth";
import { requireEnv } from "@/lib/env";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!checkPassword(body?.password, requireEnv("APP_PASSWORD"))) {
    // slow down guessing
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
