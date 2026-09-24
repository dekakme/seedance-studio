import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

export const SESSION_COOKIE = "seedance_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Constant-time comparison that also hides length differences. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signSession(secret: string, now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS);
  return `${exp}.${sign(secret, exp)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= now) return false;
  return safeEqual(sig, sign(secret, exp));
}

export function checkPassword(input: unknown, expected: string): boolean {
  return typeof input === "string" && expected.length > 0 && safeEqual(input, expected);
}

export function sessionSecret(): string {
  const secret = requireEnv("SESSION_SECRET");
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}
