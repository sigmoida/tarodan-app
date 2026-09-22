import { describe, expect, it } from "vitest";
import { hrefWithPinnedParam, toSearchParams } from "./redirect-query";

describe("toSearchParams", () => {
  it("reads Next's searchParams object, skipping undefined and repeating arrays", () => {
    expect(
      toSearchParams({ a: "1", b: ["2", "3"], c: undefined }).toString(),
    ).toBe("a=1&b=2&b=3");
  });

  it("copies a URLSearchParams instead of mutating it", () => {
    const source = new URLSearchParams("a=1");
    const copy = toSearchParams(source);
    copy.set("a", "2");
    expect(source.get("a")).toBe("1");
  });

  it("treats a missing query as empty", () => {
    expect(toSearchParams(undefined).toString()).toBe("");
  });
});

describe("hrefWithPinnedParam", () => {
  it("pins the parameter first and keeps the rest of the query", () => {
    expect(
      hrefWithPinnedParam("/x", "tab", "trades", { userId: "u1", page: "2" }),
    ).toBe("/x?tab=trades&userId=u1&page=2");
  });

  it("replaces a conflicting value instead of duplicating it", () => {
    expect(
      hrefWithPinnedParam(
        "/x",
        "tab",
        "offers",
        new URLSearchParams("tab=all"),
      ),
    ).toBe("/x?tab=offers");
  });

  it("a null value (default tab) drops the parameter entirely", () => {
    expect(hrefWithPinnedParam("/x", "tab", null, { tab: "all" })).toBe("/x");
    expect(hrefWithPinnedParam("/x", "tab", null, { q: "a" })).toBe("/x?q=a");
  });
});
