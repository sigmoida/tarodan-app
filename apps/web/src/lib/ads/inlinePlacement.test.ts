/** @format */

import { describe, expect, it } from "vitest";
import { INLINE_AD_AFTER, isInlineAdSlotAfter } from "./inlinePlacement";

describe("isInlineAdSlotAfter", () => {
  const slotsIn = (count: number) =>
    Array.from({ length: count }, (_, i) => i)
      .filter(isInlineAdSlotAfter)
      .map((index) => index + 1);

  it("afiş 8. kartın ardından gelir", () => {
    expect(INLINE_AD_AFTER).toBe(8);
    expect(isInlineAdSlotAfter(7)).toBe(true);
  });

  it("liste ne kadar uzun olursa olsun tek afiş", () => {
    expect(slotsIn(100)).toEqual([8]);
  });

  it("8 kartın altında afiş girmez", () => {
    expect(slotsIn(7)).toEqual([]);
  });
});
