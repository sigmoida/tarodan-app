import { Prisma } from "@prisma/client";
import {
  checkStatementCard,
  splitStatementFee,
  type AttemptCardFacts,
} from "./statement-fee-split";

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe("splitStatementFee (plan 4.6.4, AS-P6)", () => {
  it("books the plan's 100 %-share case: D 80.00, P 50.00 -> psp_fee 30.00 + platform cost 50.00", () => {
    // Plan 4.4: premium buyer, 3 installments at a 100 % share, C = T =
    // 1,000.00; PayTR deducts 8 % = 80.00 instead of 3 % = 30.00.
    const split = splitStatementFee(d("80.00"), d("50.00"));
    expect(split.pspFee.toFixed(2)).toBe("30.00");
    expect(split.installmentPlatformCost.toFixed(2)).toBe("50.00");
  });

  it("never books more platform cost than PayTR deducted", () => {
    const split = splitStatementFee(d("40.00"), d("50.00"));
    expect(split.installmentPlatformCost.toFixed(2)).toBe("40.00");
    expect(split.pspFee.toFixed(2)).toBe("0.00");
  });

  it("is all psp_fee without an expected platform cost (single payment, buyer pays all)", () => {
    for (const expected of [null, undefined, d("0")]) {
      const split = splitStatementFee(d("85.31"), expected);
      expect(split.pspFee.toFixed(2)).toBe("85.31");
      expect(split.installmentPlatformCost.toFixed(2)).toBe("0.00");
    }
  });

  it("always sums to the deduction (the ledger check)", () => {
    for (const [fee, cost] of [
      ["0.01", "0.02"],
      ["148.49", "49.98"],
      ["24.99", "24.99"],
      ["139.25", "0"],
    ]) {
      const split = splitStatementFee(d(fee), d(cost));
      expect(split.pspFee.plus(split.installmentPlatformCost).toFixed(2)).toBe(
        d(fee).toFixed(2),
      );
    }
  });
});

describe("checkStatementCard (plan 5.6: card switch after quoting)", () => {
  const attempt = (over: Partial<AttemptCardFacts> = {}): AttemptCardFacts => ({
    installmentCount: 3,
    cardFamily: "world",
    bin6: "454671",
    installmentRatePct: d("8.000"),
    ...over,
  });

  it("agrees with the quoted card", () => {
    expect(
      checkStatementCard(
        {
          cardBrand: "WORLD",
          maskedPan: "454671******1234",
          feeRatePct: d("8.00"),
        },
        attempt(),
      ),
    ).toEqual({ cardMismatch: [], rateDriftPoints: null });
  });

  it("flags another family and another BIN (no card digits in the result)", () => {
    const check = checkStatementCard(
      {
        cardBrand: "BONUS",
        maskedPan: "540667******5403",
        feeRatePct: d("8.00"),
      },
      attempt(),
    );
    expect(check.cardMismatch).toEqual(["family", "bin"]);
  });

  it("reads PayTR's brand spellings and Turkish letters as the family", () => {
    for (const [brand, family] of [
      ["World Card", "world"],
      ["Sağlam Kart", "saglamkart"],
      ["MAXIMUM", "maximum"],
      ["CardFinans", "cardfinans"],
    ]) {
      expect(
        checkStatementCard(
          { cardBrand: brand, maskedPan: null, feeRatePct: null },
          attempt({ cardFamily: family }),
        ).cardMismatch,
      ).toEqual([]);
    }
  });

  it("warns when the deduction rate drifts more than 0.5 points from the priced rate", () => {
    expect(
      checkStatementCard(
        { cardBrand: null, maskedPan: null, feeRatePct: d("8.40") },
        attempt(),
      ).rateDriftPoints,
    ).toBeNull();
    // Exactly 0.5 points (either way) is within the tolerance.
    for (const rate of ["8.50", "7.50"]) {
      expect(
        checkStatementCard(
          { cardBrand: null, maskedPan: null, feeRatePct: d(rate) },
          attempt(),
        ).rateDriftPoints,
      ).toBeNull();
    }
    expect(
      checkStatementCard(
        { cardBrand: null, maskedPan: null, feeRatePct: d("7.49") },
        attempt(),
      ).rateDriftPoints?.toFixed(2),
    ).toBe("0.51");
    expect(
      checkStatementCard(
        { cardBrand: null, maskedPan: null, feeRatePct: d("8.75") },
        attempt(),
      ).rateDriftPoints?.toFixed(2),
    ).toBe("0.75");
  });

  it("checks nothing for a single payment or missing facts", () => {
    expect(
      checkStatementCard(
        {
          cardBrand: "BONUS",
          maskedPan: "540667******5403",
          feeRatePct: d("2.0"),
        },
        attempt({ installmentCount: 1 }),
      ),
    ).toEqual({ cardMismatch: [], rateDriftPoints: null });
    expect(
      checkStatementCard(
        {
          cardBrand: "BONUS",
          maskedPan: "540667******5403",
          feeRatePct: d("12"),
        },
        attempt({ cardFamily: null, bin6: null, installmentRatePct: null }),
      ),
    ).toEqual({ cardMismatch: [], rateDriftPoints: null });
  });
});
