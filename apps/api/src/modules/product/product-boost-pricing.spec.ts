import { BadRequestException } from "@nestjs/common";
import { ProductBoostService } from "./product-boost.service";

/**
 * Ad-package pricing resolution — the money-path core of the boost purchase.
 * Verifies the tier is chosen by the product's price range, the campaign price
 * only applies inside its (optional) window, and unknown package/tier throws.
 */
describe("ProductBoostService — ad-package pricing", () => {
  let prisma: any;
  let service: ProductBoostService;

  const EKO = { id: "pkg-eko", name: "Ekonomik Paket", showcaseOnHome: false };
  // 7-gün tiers: 200-999 → 150, 1000-5000 → 250, 5000+ → 500
  const tiers = [
    {
      durationDays: 7,
      minAmount: 200,
      maxAmount: 999,
      price: 150,
      campaignPrice: null,
      campaignStartsAt: null,
      campaignEndsAt: null,
      isActive: true,
    },
    {
      durationDays: 7,
      minAmount: 1000,
      maxAmount: 5000,
      price: 250,
      campaignPrice: null,
      campaignStartsAt: null,
      campaignEndsAt: null,
      isActive: true,
    },
    {
      durationDays: 7,
      minAmount: 5000,
      maxAmount: null,
      price: 500,
      campaignPrice: null,
      campaignStartsAt: null,
      campaignEndsAt: null,
      isActive: true,
    },
  ];

  beforeEach(() => {
    prisma = {
      adPackage: { findFirst: jest.fn().mockResolvedValue(EKO) },
      adPackageTier: {
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            tiers.find(
              (t) =>
                t.durationDays === where.durationDays &&
                t.minAmount <= where.minAmount.lte &&
                (t.maxAmount == null || t.maxAmount >= where.minAmount.lte),
            ) ?? null,
          ),
        ),
      },
    };
    service = new ProductBoostService(prisma, {} as any);
  });

  const resolve = (dur: number, productPrice: number) =>
    (service as any).resolvePackagePrice("pkg-eko", dur, productPrice);

  it("picks the tier by the product's price range", async () => {
    expect((await resolve(7, 500)).price).toBe(150); // 200-999
    expect((await resolve(7, 3000)).price).toBe(250); // 1000-5000
    expect((await resolve(7, 12000)).price).toBe(500); // 5000+ (no upper bound)
  });

  it("returns package name + showcase flag from the package", async () => {
    const r = await resolve(7, 500);
    expect(r.packageName).toBe("Ekonomik Paket");
    expect(r.showcaseOnHome).toBe(false);
  });

  it("throws when no tier matches (e.g. below the lowest range)", async () => {
    await expect(resolve(7, 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when the package is missing/inactive", async () => {
    prisma.adPackage.findFirst.mockResolvedValueOnce(null);
    await expect(resolve(7, 500)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe("campaign price window", () => {
    const t = (over: any) => ({
      price: 1900,
      campaignPrice: 1750,
      campaignStartsAt: null,
      campaignEndsAt: null,
      ...over,
    });
    const eff = (tier: any) => (service as any).effectiveTierPrice(tier);

    it("uses the campaign price when there is no window", () => {
      expect(eff(t({}))).toBe(1750);
    });
    it("uses the campaign price inside the window", () => {
      const now = Date.now();
      expect(
        eff(
          t({
            campaignStartsAt: new Date(now - 1e5),
            campaignEndsAt: new Date(now + 1e5),
          }),
        ),
      ).toBe(1750);
    });
    it("falls back to list price before the window starts", () => {
      expect(eff(t({ campaignStartsAt: new Date(Date.now() + 1e6) }))).toBe(
        1900,
      );
    });
    it("falls back to list price after the window ends", () => {
      expect(eff(t({ campaignEndsAt: new Date(Date.now() - 1e6) }))).toBe(1900);
    });
    it("no campaign price → list price", () => {
      expect(eff(t({ campaignPrice: null }))).toBe(1900);
    });
  });
});
