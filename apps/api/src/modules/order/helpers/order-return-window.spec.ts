import {
  effectiveReturnWindowEnd,
  escrowReleaseAt,
  returnWindowEndsAt,
} from "./order-return-window";

describe("order-return-window", () => {
  const DELIVERED_AT = new Date("2026-10-01T10:00:00.000Z");
  const plusDays = (days: number) => {
    const date = new Date(DELIVERED_AT);
    date.setDate(date.getDate() + days);
    return date;
  };

  it("pencere sonu teslimden takvim günüyle hesaplanır (escrow ile aynı)", () => {
    expect(returnWindowEndsAt(DELIVERED_AT, 14)).toEqual(plusDays(14));
  });

  it("damga varsa bugünkü pencere ne olursa olsun damga geçerlidir", () => {
    const stamped = plusDays(14);
    expect(
      effectiveReturnWindowEnd(
        { returnWindowEndsAt: stamped },
        DELIVERED_AT,
        30,
      ),
    ).toBe(stamped);
    expect(
      effectiveReturnWindowEnd(
        { returnWindowEndsAt: stamped },
        DELIVERED_AT,
        7,
      ),
    ).toBe(stamped);
  });

  it("escrow serbest bırakma = pencere sonu + grace (takvim günü)", () => {
    const windowEnd = plusDays(14);
    const expected = new Date(windowEnd);
    expected.setDate(expected.getDate() + 1);
    expect(escrowReleaseAt(windowEnd, 1)).toEqual(expected);
    // Girdi tarihi kopyalanır, değiştirilmez.
    expect(windowEnd).toEqual(plusDays(14));
  });

  it("damgasız eski siparişte bugünkü pencereyle hesaplanır", () => {
    expect(
      effectiveReturnWindowEnd({ returnWindowEndsAt: null }, DELIVERED_AT, 20),
    ).toEqual(plusDays(20));
    expect(effectiveReturnWindowEnd({}, DELIVERED_AT, 14)).toEqual(
      plusDays(14),
    );
  });
});
