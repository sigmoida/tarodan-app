import { describe, expect, it } from "vitest";
import { canCreateTestAccount } from "./testLane";

const valid = {
  email: "apple-review@tarodan.com.tr",
  password: "Review2026",
  displayName: "App Review",
};

describe("canCreateTestAccount", () => {
  it("accepts a complete form whose password meets the shared policy", () => {
    expect(canCreateTestAccount(valid)).toBe(true);
  });

  it.each(["review2026", "REVIEW2026", "Reviewxyz", "Rev1"])(
    "rejects password %s that fails the shared policy",
    (password) => {
      expect(canCreateTestAccount({ ...valid, password })).toBe(false);
    },
  );

  it("rejects a too-short email or display name", () => {
    expect(canCreateTestAccount({ ...valid, email: "a@b" })).toBe(false);
    expect(canCreateTestAccount({ ...valid, displayName: "A" })).toBe(false);
  });
});
