import { CommissionSellerType } from "@prisma/client";
import {
  SEED_COMMISSION_PROFILES,
  SEED_COMMISSION_PRICE_BANDS,
  SEED_COMMISSION_RULE_SET_IDS,
  SEED_CATEGORY_DEFINITIONS,
  SEED_SHIPPING_TIERS,
} from "../../prisma/seed-config";
import { isUUID } from "class-validator";

describe("comprehensive seed pricing config", () => {
  it("seeds only the car category", () => {
    expect(SEED_CATEGORY_DEFINITIONS).toEqual([
      expect.objectContaining({ name: "Araba", slug: "araba" }),
    ]);
  });

  it("uses deterministic UUID-v4 ids for every seeded commission set", () => {
    expect(Object.values(SEED_COMMISSION_RULE_SET_IDS)).toHaveLength(3);
    for (const id of Object.values(SEED_COMMISSION_RULE_SET_IDS)) {
      expect(isUUID(id, "4")).toBe(true);
    }
  });

  it("defines sixteen strict commission profiles with the same four gapless ranges", () => {
    expect(SEED_COMMISSION_PRICE_BANDS).toEqual([
      expect.objectContaining({ minAmount: 0, maxAmount: 1_000 }),
      expect.objectContaining({ minAmount: 1_000, maxAmount: 10_000 }),
      expect.objectContaining({ minAmount: 10_000, maxAmount: 25_000 }),
      expect.objectContaining({ minAmount: 25_000, maxAmount: null }),
    ]);
    expect(SEED_COMMISSION_PROFILES).toHaveLength(16);

    for (const sellerType of Object.values(CommissionSellerType)) {
      const ranges = SEED_COMMISSION_PROFILES.filter(
        (profile) => profile.sellerType === sellerType,
      ).sort((a, b) => a.minAmount - b.minAmount);
      expect(ranges[0]?.minAmount).toBe(0);
      expect(ranges.at(-1)?.maxAmount).toBeNull();
      expect(
        ranges.map(({ minAmount, maxAmount }) => [minAmount, maxAmount]),
      ).toEqual([
        [0, 1_000],
        [1_000, 10_000],
        [10_000, 25_000],
        [25_000, null],
      ]);
      for (let index = 1; index < ranges.length; index += 1) {
        expect(ranges[index - 1].maxAmount).toBe(ranges[index].minAmount);
      }

      for (const amount of [
        0, 999.99, 1_000, 9_999.99, 10_000, 24_999.99, 25_000, 1_000_000,
      ]) {
        const matches = ranges.filter(
          (profile) =>
            amount >= profile.minAmount &&
            (profile.maxAmount === null || amount < profile.maxAmount),
        );
        expect(matches).toHaveLength(1);
      }
    }
  });

  it("uses one small/medium/large tariff at 100/130/160 TL", () => {
    expect(
      SEED_SHIPPING_TIERS.map(({ code, minDesi, maxDesi, amount }) => ({
        code,
        minDesi,
        maxDesi,
        amount,
      })),
    ).toEqual([
      { code: "small", minDesi: 0, maxDesi: 2, amount: 100 },
      { code: "medium", minDesi: 2, maxDesi: 5, amount: 130 },
      { code: "large", minDesi: 5, maxDesi: null, amount: 160 },
    ]);
  });
});
