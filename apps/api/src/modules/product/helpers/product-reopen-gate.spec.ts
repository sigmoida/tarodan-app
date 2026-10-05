import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { assertListingMayReopen } from "./product-reopen-gate";

describe("assertListingMayReopen", () => {
  const product = {
    sellerId: "seller-1",
    categoryId: "cat-1",
    price: 150,
    quantity: 2 as number | null,
  };

  const makeDeps = (canCreate = true) => ({
    membershipService: {
      canCreateListing: jest
        .fn()
        .mockResolvedValue(
          canCreate ? { allowed: true } : { allowed: false, reason: "limit" },
        ),
      getUserLimits: jest
        .fn()
        .mockResolvedValue({ tierName: "Ücretsiz", maxTotalListings: 3 }),
    },
    commissionGuard: { assertListingRuleExists: jest.fn() },
  });

  it("tüm kapılar açıksa geçer ve komisyon kuralı ilanın kategori+fiyatıyla sorulur", async () => {
    const deps = makeDeps();

    await expect(
      assertListingMayReopen(deps as any, product),
    ).resolves.toBeUndefined();

    expect(deps.membershipService.canCreateListing).toHaveBeenCalledWith(
      "seller-1",
    );
    expect(deps.commissionGuard.assertListingRuleExists).toHaveBeenCalledWith({
      sellerId: "seller-1",
      categoryId: "cat-1",
      amount: 150,
    });
  });

  it("üyelik ilan limiti doluysa reddeder (komisyon kuralına bakılmaz)", async () => {
    const deps = makeDeps(false);

    await expect(
      assertListingMayReopen(deps as any, product),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(deps.commissionGuard.assertListingRuleExists).not.toHaveBeenCalled();
  });

  it("stok 0 ise limite bile bakmadan reddeder", async () => {
    const deps = makeDeps();

    await expect(
      assertListingMayReopen(deps as any, { ...product, quantity: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deps.membershipService.canCreateListing).not.toHaveBeenCalled();
  });

  it("istekle gelen yeni stok ilanın mevcut stoğunu ezer", async () => {
    const deps = makeDeps();

    await expect(
      assertListingMayReopen(deps as any, { ...product, quantity: 0 }, 5),
    ).resolves.toBeUndefined();
    await expect(
      assertListingMayReopen(deps as any, product, 0),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sınırsız (null) stok geçer", async () => {
    await expect(
      assertListingMayReopen(makeDeps() as any, { ...product, quantity: null }),
    ).resolves.toBeUndefined();
  });

  it("komisyon kuralı yoksa kuralın hatası yükselir", async () => {
    const deps = makeDeps();
    deps.commissionGuard.assertListingRuleExists.mockRejectedValue(
      new BadRequestException("no rule"),
    );

    await expect(
      assertListingMayReopen(deps as any, product),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
