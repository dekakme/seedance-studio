import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/range";

describe("parseRange", () => {
  it("returns null without a header", () => expect(parseRange(null, 100)).toBeNull());
  it("parses a closed range", () => expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 }));
  it("parses an open range", () => expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 }));
  it("parses a suffix range", () => expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 }));
  it("clamps the end", () => expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 }));
  it("rejects unsatisfiable or malformed ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-1", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
  });
});
