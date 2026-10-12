import { describe, expect, it } from "vitest";
import { shippedBeforeDays } from "./shippedBefore";

const NOW = new Date("2026-10-12T12:00:00Z");

describe("shippedBeforeDays", () => {
  it("counts whole days between the threshold and now", () => {
    expect(shippedBeforeDays("2026-10-02T12:00:00Z", NOW)).toBe(10);
  });

  it("rounds a threshold stamped a few minutes ago to the same day count", () => {
    expect(shippedBeforeDays("2026-10-02T12:05:00Z", NOW)).toBe(10);
    expect(shippedBeforeDays("2026-10-02T11:55:00Z", NOW)).toBe(10);
  });

  it("never goes negative for a future threshold", () => {
    expect(shippedBeforeDays("2026-10-20T12:00:00Z", NOW)).toBe(0);
  });

  it("is null for an empty or unparseable value", () => {
    expect(shippedBeforeDays("", NOW)).toBeNull();
    expect(shippedBeforeDays(null, NOW)).toBeNull();
    expect(shippedBeforeDays("not-a-date", NOW)).toBeNull();
  });
});
