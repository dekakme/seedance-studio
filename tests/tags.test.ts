import { describe, expect, it } from "vitest";
import { refTags, removeRefFromPrompt, splitByTags, unknownTags, type RefItem } from "@/lib/tags";

const refs: RefItem[] = [
  { kind: "image", url: "https://cdn.example.com/a.png" },
  { kind: "video", url: "https://cdn.example.com/v.mp4" },
  { kind: "image", url: "https://cdn.example.com/b.png" },
  { kind: "audio", url: "https://cdn.example.com/s.mp3" },
];

describe("refTags", () => {
  it("numbers each kind separately in upload order", () => {
    expect(refTags(refs).map((t) => t.tag)).toEqual(["@Image1", "@Video1", "@Image2", "@Audio1"]);
  });
});

describe("removeRefFromPrompt", () => {
  it("drops the removed tag and renumbers later tags of the same kind", () => {
    const prompt = "@Image1 rides past @Image2 while @Video1 plays";
    expect(removeRefFromPrompt(prompt, refs, 0)).toBe("rides past @Image1 while @Video1 plays");
  });

  it("leaves other kinds alone", () => {
    expect(removeRefFromPrompt("@Video1 and @Image2", refs, 1)).toBe("and @Image2");
  });
});

describe("unknownTags", () => {
  it("lists tags that point at no reference", () => {
    expect(unknownTags("@Image1 @Image3 @Video2 @Audio1", refs)).toEqual(["@Image3", "@Video2"]);
  });
});

describe("splitByTags", () => {
  it("splits text into plain and tag segments", () => {
    expect(splitByTags("a @Image1 b")).toEqual([
      { text: "a ", tag: false },
      { text: "@Image1", tag: true },
      { text: " b", tag: false },
    ]);
  });
});
