import { CommissionSellerType } from "@prisma/client";
import {
  SEED_COMMISSION_PROFILES,
  SEED_COMMISSION_RULE_SET_IDS,
  SEED_SHIPPING_TIERS,
} from "../../prisma/seed-config";
import { isUUID } from "class-validator";

describe("comprehensive seed pricing config", () => {
  it("uses deterministic UUID-v4 ids for every seeded commission set", () => {
    expect(Object.values(SEED_COMMISSION_RULE_SET_IDS)).toHaveLength(3);
    for (const id of Object.values(SEED_COMMISSION_RULE_SET_IDS)) {
      expect(isUUID(id, "4")).toBe(true);
    }
  });

  it("defines ten strict commission profiles with gapless seller-type ranges", () => {
    expect(SEED_COMMISSION_PROFILES).toHaveLength(10);

    for (const sellerType of Object.values(CommissionSellerType)) {
      const ranges = SEED_COMMISSION_PROFILES.filter(
        (profile) => profile.sellerType === sellerType,
      ).sort((a, b) => a.minAmount - b.minAmount);
      expect(ranges[0]?.minAmount).toBe(0);
      expect(ranges.at(-1)?.maxAmount).toBeNull();
      for (let index = 1; index < ranges.length; index += 1) {
        expect(ranges[index - 1].maxAmount).toBe(ranges[index].minAmount);
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
