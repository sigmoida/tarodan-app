import { describe, expect, it } from "vitest";
import { emailImageTag, insertAtCursor, isHttpUrl } from "./imageSnippet";

describe("isHttpUrl", () => {
  it("accepts http and https only", () => {
    expect(isHttpUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isHttpUrl("http://cdn.example.com/a.png")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
});

describe("emailImageTag", () => {
  it("builds a responsive img tag", () => {
    expect(emailImageTag("https://cdn.example.com/a.png")).toBe(
      '<img src="https://cdn.example.com/a.png" alt="" style="max-width:100%">',
    );
  });

  it("escapes quotes in the address", () => {
    expect(emailImageTag('https://x.test/a"b.png')).toContain("a&quot;b.png");
  });

  it("refuses a non-http(s) address", () => {
    expect(emailImageTag("javascript:alert(1)")).toBeNull();
  });
});

describe("insertAtCursor", () => {
  it("inserts at the caret", () => {
    expect(insertAtCursor("ab", "X", 1, 1)).toEqual({ value: "aXb", caret: 2 });
  });

  it("replaces a selection", () => {
    expect(insertAtCursor("abcd", "X", 1, 3)).toEqual({
      value: "aXd",
      caret: 2,
    });
  });

  it("appends when the position is unknown", () => {
    expect(insertAtCursor("ab", "X")).toEqual({ value: "abX", caret: 3 });
    expect(insertAtCursor("ab", "X", null, null)).toEqual({
      value: "abX",
      caret: 3,
    });
  });
});
