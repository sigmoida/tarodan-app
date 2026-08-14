import { ForbiddenException } from "@nestjs/common";
import { ProductCreateService } from "./product-create.service";
import { sellerAutoEnableData } from "../helpers/seller-auto-enable.helper";

/**
 * Kurumsal akışta "satış ancak NİHAİ onaydan sonra" kuralı BACKEND'de de
 * durmalı. Engelleme yalnız web'deki BusinessMembershipGuard yönlendirmesiydi:
 * businessStatus=pending/rejected kullanıcı API'den ilan açıp satabiliyordu.
 */
describe("ProductCreateService — kurumsal onay kapısı", () => {
  const LIMIT_CHECK_SENTINEL = new Error("REACHED_LIMIT_CHECK");

  const makeService = (seller: Record<string, unknown>) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(seller) },
    };
    const membershipService = {
      // Kapı, limit kontrolünden ÖNCE çalışmalı; buraya ulaşmak "kapı geçildi"
      // demektir — sentinel ile ayırt edilir.
      canCreateListing: jest.fn().mockRejectedValue(LIMIT_CHECK_SENTINEL),
    };
    return new ProductCreateService(
      prisma as any,
      {} as any,
      membershipService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertListingRuleExists: jest.fn() } as any,
    );
  };

  it("businessStatus=pending satıcı ilan açamaz", async () => {
    const service = makeService({
      id: "seller-1",
      isBanned: false,
      isSeller: false,
      businessStatus: "pending",
    });

    await expect(
      service.create("seller-1", { title: "Test" } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("businessStatus=rejected satıcı ilan açamaz", async () => {
    const service = makeService({
      id: "seller-1",
      isBanned: false,
      isSeller: false,
      businessStatus: "rejected",
    });

    await expect(
      service.create("seller-1", { title: "Test" } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("businessStatus=approved kurumsal satıcı kapıyı geçer", async () => {
    const service = makeService({
      id: "seller-1",
      isBanned: false,
      isSeller: true,
      businessStatus: "approved",
    });

    await expect(
      service.create("seller-1", { title: "Test" } as any),
    ).rejects.toBe(LIMIT_CHECK_SENTINEL);
  });

  it("bireysel satıcı (businessStatus=null) kapıdan etkilenmez", async () => {
    const service = makeService({
      id: "seller-1",
      isBanned: false,
      isSeller: true,
      businessStatus: null,
    });

    await expect(
      service.create("seller-1", { title: "Test" } as any),
    ).rejects.toBe(LIMIT_CHECK_SENTINEL);
  });
});

/**
 * İlk ilanla satıcı moduna geçişte mevcut sellerType EZİLMEMELİ. Eskiden
 * `isSeller=false` olan herkese "individual" yazılıyordu — kurumsal akıştaki
 * "verified" tip ilk ilanla siliniyordu.
 */
describe("sellerAutoEnableData — sellerType korunur", () => {
  it("tip atanmamışsa individual verir", () => {
    expect(sellerAutoEnableData({ sellerType: null })).toEqual({
      isSeller: true,
      sellerType: "individual",
    });
  });

  it("mevcut tipi (verified) korur", () => {
    expect(sellerAutoEnableData({ sellerType: "verified" as any })).toEqual({
      isSeller: true,
      sellerType: "verified",
    });
  });
});
