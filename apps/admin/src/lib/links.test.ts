import { describe, expect, it } from "vitest";
import { isValidLink } from "./links";

describe("isValidLink", () => {
  it.each(["", "  ", null, undefined, "https://a.co/x", "http://a.co", "/", "/kategori/x"])(
    "accepts %j",
    (v) => expect(isValidLink(v)).toBe(true),
  );
  it.each(["a.co", "//evil.com", "/\\evil", "javascript:alert(1)", "https://", "/a b"])(
    "rejects %j",
    (v) => expect(isValidLink(v)).toBe(false),
  );
});
