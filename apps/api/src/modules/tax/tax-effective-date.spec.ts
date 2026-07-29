import { TaxService } from "./tax.service";

describe("TaxService effective date resolution", () => {
  const region = { id: "region-tr" };

  function makeService(rules: any[]) {
    const prisma = {
      taxRegion: {
        findFirst: jest.fn().mockResolvedValue(region),
      },
      taxRate: {},
      taxRule: {
        findMany: jest.fn().mockResolvedValue(rules),
      },
    };
    return new TaxService(prisma as any);
  }

  it("ignores an expired higher-priority rule and resolves the current fallback", async () => {
    const service = makeService([
      {
        scope: "category",
        categoryId: "category-1",
        priority: 100,
        taxRate: {
          id: "expired-rate",
          name: "Expired",
          rate: 20,
          isActive: true,
          effectiveFrom: new Date("2020-01-01"),
          effectiveTo: new Date("2020-12-31"),
        },
      },
      {
        scope: "default_rate",
        categoryId: null,
        priority: 1,
        taxRate: {
          id: "current-rate",
          name: "Current",
          rate: 10,
          isActive: true,
          effectiveFrom: new Date("2025-01-01"),
          effectiveTo: null,
        },
      },
    ]);

    await expect(
      service.resolveTaxRate("TR", null, "category-1"),
    ).resolves.toEqual({
      taxRateId: "current-rate",
      name: "Current",
      rate: 10,
    });
  });

  it("returns null when the only matching rate starts in the future", async () => {
    const service = makeService([
      {
        scope: "default_rate",
        categoryId: null,
        priority: 1,
        taxRate: {
          id: "future-rate",
          name: "Future",
          rate: 20,
          isActive: true,
          effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
          effectiveTo: null,
        },
      },
    ]);

    await expect(service.resolveTaxRate("TR")).resolves.toBeNull();
  });
});
