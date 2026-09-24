import { describe, expect, it } from "vitest";
import { checkPassword, signSession, verifySession } from "@/lib/auth";

const SECRET = "s".repeat(32);

describe("session tokens", () => {
  it("accepts a fresh token", () => {
    expect(verifySession(signSession(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession("x".repeat(32)), SECRET)).toBe(false);
  });

  it("rejects expired tokens", () => {
    const token = signSession(SECRET, 0);
    expect(verifySession(token, SECRET, 31 * 24 * 3600 * 1000)).toBe(false);
  });

  it("rejects tampered and malformed tokens", () => {
    const [, sig] = signSession(SECRET).split(".");
    expect(verifySession(`9999999999.${sig}`, SECRET)).toBe(false);
    expect(verifySession("garbage", SECRET)).toBe(false);
    expect(verifySession(undefined, SECRET)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("matches only the exact password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter", "hunter2")).toBe(false);
    expect(checkPassword(undefined, "hunter2")).toBe(false);
    expect(checkPassword("", "")).toBe(false);
  });
});
