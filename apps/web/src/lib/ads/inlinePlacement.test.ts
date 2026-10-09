/** @format */

import { describe, expect, it } from "vitest";
import { inlineAdSlotAfter } from "./inlinePlacement";

describe("inlineAdSlotAfter", () => {
  const slots = (count: number) =>
    Array.from({ length: count }, (_, i) => inlineAdSlotAfter(i))
      .map((slot, index) => (slot === null ? null : { after: index + 1, slot }))
      .filter(Boolean);

  it("ilk afiş 8. kartın ardından, sonrakiler her 16 kartta bir gelir", () => {
    expect(slots(60)).toEqual([
      { after: 8, slot: 0 },
      { after: 24, slot: 1 },
      { after: 40, slot: 2 },
    ]);
  });

  it("8 kartın altında afiş girmez", () => {
    expect(slots(7)).toEqual([]);
  });

  it("tekrar sayısı sınırlıdır (56. karttan sonra yok)", () => {
    expect(inlineAdSlotAfter(55)).toBeNull();
  });
});
