import { computeQualityScore } from "./quality-score";

/**
 * Listing quality score (decision D8, ADR 0014): photos 0..40, description
 * 0..20, the seller's stored trust rating 0..20, and no verified bonus.
 */
describe("computeQualityScore", () => {
  const LONG = "x".repeat(200);
  const MEDIUM = "x".repeat(50);

  it("gives 5 points per photo, capped at 8", () => {
    expect(computeQualityScore({ photoCount: 0 })).toBe(0);
    expect(computeQualityScore({ photoCount: 3 })).toBe(15);
    expect(computeQualityScore({ photoCount: 8 })).toBe(40);
    expect(computeQualityScore({ photoCount: 20 })).toBe(40);
    expect(computeQualityScore({ photoCount: -2 })).toBe(0);
  });

  it("gives 0 / 10 / 20 for the description length thresholds", () => {
    expect(computeQualityScore({ photoCount: 0, description: null })).toBe(0);
    expect(
      computeQualityScore({ photoCount: 0, description: "x".repeat(49) }),
    ).toBe(0);
    expect(computeQualityScore({ photoCount: 0, description: MEDIUM })).toBe(
      10,
    );
    expect(computeQualityScore({ photoCount: 0, description: LONG })).toBe(20);
    // Whitespace does not count.
    expect(
      computeQualityScore({
        photoCount: 0,
        description: `  ${"x".repeat(49)}   `,
      }),
    ).toBe(0);
  });

  it.each([
    [5, 20],
    [4.85, 19],
    [4.37, 17],
    [3.74, 15],
    [3.62, 14],
    [2.91, 12],
    [0, 0],
  ])("gives round(trust rating %d × 4) = %i points", (rating, points) => {
    expect(
      computeQualityScore({ photoCount: 0, sellerTrustRating: rating }),
    ).toBe(points);
  });

  it("gives round(score_x100 / 25) points for every stored hundredth", () => {
    // rating × 4 is score_x100 / 25: its fraction is a multiple of 0.04, so
    // there is no .5 tie and no float edge on the two-decimal rating.
    for (let x100 = 0; x100 <= 500; x100++) {
      expect([
        x100,
        computeQualityScore({ photoCount: 0, sellerTrustRating: x100 / 100 }),
      ]).toEqual([x100, Math.round(x100 / 25)]);
    }
  });

  it("gives no rating points to a seller without a score (`new`)", () => {
    expect(
      computeQualityScore({ photoCount: 0, sellerTrustRating: null }),
    ).toBe(0);
    expect(computeQualityScore({ photoCount: 0 })).toBe(0);
  });

  it("clamps an out-of-range rating to 0..5", () => {
    expect(computeQualityScore({ photoCount: 0, sellerTrustRating: 9 })).toBe(
      20,
    );
    expect(computeQualityScore({ photoCount: 0, sellerTrustRating: -1 })).toBe(
      0,
    );
  });

  it("tops out at 80 with no verified bonus", () => {
    expect(
      computeQualityScore({
        photoCount: 8,
        description: LONG,
        sellerTrustRating: 5,
      }),
    ).toBe(80);
    // An input that used to carry `isVerifiedSeller` earns nothing for it.
    expect(
      computeQualityScore({
        photoCount: 8,
        description: LONG,
        sellerTrustRating: 5,
        isVerifiedSeller: true,
      } as never),
    ).toBe(80);
  });
});
