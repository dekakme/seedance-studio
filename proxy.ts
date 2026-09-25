import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // /api/uploads checks the session itself: running proxy on it would buffer (and cap at 10MB) every upload
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/uploads).*)"],
};
