import { HealthService } from "./health.service";

function health(activeSet: unknown) {
  const prisma = {
    membershipTier: { count: jest.fn().mockResolvedValue(4) },
    commissionRuleSet: { findFirst: jest.fn().mockResolvedValue(activeSet) },
    category: {
      findMany: jest.fn().mockResolvedValue([{ id: "cat", name: "Category" }]),
    },
    taxRule: { count: jest.fn().mockResolvedValue(1) },
    shippingTariff: {
      findFirst: jest.fn().mockResolvedValue({
        id: "tariff",
        packageTiers: [
          { code: "small" },
          { code: "medium" },
          { code: "large" },
        ],
      }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: "platform" }) },
  };
  const tradeCommon = {
    resolveWarehouseAddressId: jest.fn().mockResolvedValue("warehouse"),
  };
  return new HealthService(
    prisma as any,
    {} as any,
    {} as any,
    tradeCommon as any,
  );
}

describe("business config commission readiness", () => {
  const original = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });
  afterAll(() => {
    process.env.NODE_ENV = original;
  });

  it("requires a published set with rules", async () => {
    await expect((health(null) as any).checkBusinessConfig()).resolves.toBe(
      false,
    );
    await expect(
      (health({ id: "set", rules: [] }) as any).checkBusinessConfig(),
    ).resolves.toBe(false);
  });

  it("accepts a fully covering published strict set", async () => {
    const rules = ["FREE", "BASIC", "PREMIUM", "BUSINESS"].map(
      (sellerType) => ({
        categoryId: "cat",
        sellerType,
        minAmount: 0,
        maxAmount: null,
      }),
    );
    await expect(
      (health({ id: "set", rules }) as any).checkBusinessConfig(),
    ).resolves.toBe(true);
  });

  it("rejects a non-empty set that has a price gap", async () => {
    const rules = ["FREE", "BASIC", "PREMIUM", "BUSINESS"].map(
      (sellerType) => ({
        categoryId: "cat",
        sellerType,
        minAmount: 10,
        maxAmount: null,
      }),
    );
    await expect(
      (health({ id: "set", rules }) as any).checkBusinessConfig(),
    ).resolves.toBe(false);
  });
});
