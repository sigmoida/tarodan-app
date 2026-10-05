import { BadRequestException } from "@nestjs/common";
import { ListingRemovalReason, ProductStatus } from "@prisma/client";
import { AdminProductService } from "./admin-product.service";
import {
  listingRemovalFilterWhere,
  toAdminRemovalEvent,
  toAdminRemovalSummary,
} from "./admin-product-removal.helper";

/**
 * Yönetici reddi ve kaldırması "kural ihlali" nedenini ihlal koduyla kaydeder;
 * satıcıya giden açıklama (rejectionReason) aynen yazılmaya devam eder. Admin
 * listesi neden/kaldıran ile süzülür, detay geçmişi (serbest metin dahil)
 * yalnız bu admin uçlarında döner.
 */
describe("AdminProductService — kaldırma nedeni", () => {
  const makeService = (product: Record<string, unknown> = {}) => {
    const row = {
      id: "p1",
      sellerId: "seller-1",
      title: "Hot Wheels",
      status: ProductStatus.pending,
      orders: [],
      _count: { offers: 1, orders: 0 },
      ...product,
    };
    const tx = {
      product: {
        update: jest.fn().mockResolvedValue({ ...row }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productBoost: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      createInAppNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminProductService(
      prisma as any,
      audit as any,
      {} as any, // discountService
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any, // search
      { del: jest.fn(), delPattern: jest.fn() } as any, // cache
      notifications as any,
      undefined as any, // storage
      { assertListingRuleExists: jest.fn() } as any,
      {} as any, // productService
      {} as any, // mediaService
      {} as any, // membershipService
    );
    return { service, prisma, tx, notifications };
  };

  describe("rejectProduct", () => {
    it("kural ihlalini ihlal koduyla kaydeder; satıcıya giden gerekçe aynen yazılır", async () => {
      const { service, tx, notifications } = makeService();

      await service.rejectProduct("admin-1", "p1", {
        reason: "Replika olduğu belli",
        violationCode: "counterfeit_replica",
      });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: {
          status: ProductStatus.rejected,
          rejectionReason: "Replika olduğu belli",
        },
      });
      expect(tx.productRemovalEvent.createMany).toHaveBeenCalledWith({
        data: [
          {
            productId: "p1",
            reason: ListingRemovalReason.policy_violation,
            platform: null,
            violationCode: "counterfeit_replica",
            detail: "Replika olduğu belli",
            statusBefore: ProductStatus.pending,
            statusAfter: ProductStatus.rejected,
            // Onay bekleyen ilan vitrinde değildi: kaydedilir, sayılmaz.
            fromStorefront: false,
            actorUserId: "admin-1",
          },
        ],
      });
      // Satıcı bildirimi değişmedi: gerekçe metni gider.
      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "seller-1",
        expect.anything(),
        { productTitle: "Hot Wheels", reason: "Replika olduğu belli" },
      );
    });

    it("kodsuz eski çağıran (moderasyon kuyruğu) kabul edilir: kod null", async () => {
      const { service, tx } = makeService();

      await service.rejectProduct("admin-1", "p1", { reason: "Yetersiz" });

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.policy_violation,
          violationCode: null,
        }),
      );
    });

    it("katalog dışı ihlal kodu 400 döner, ilan reddedilmez", async () => {
      const { service, prisma } = makeService();

      await expect(
        service.rejectProduct("admin-1", "p1", {
          reason: "x",
          violationCode: "nope",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("toplu red ihlal kodunu her ilana taşır", async () => {
      const { service, tx } = makeService();

      await service.bulkRejectProducts(
        "admin-1",
        ["p1"],
        "Mükerrer",
        "duplicate_listing",
      );

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0]
          .violationCode,
      ).toBe("duplicate_listing");
    });
  });

  describe("deleteProduct (yumuşak kaldırma)", () => {
    it("kural ihlalini kod + açıklamayla kaydeder", async () => {
      const { service, tx } = makeService({ status: ProductStatus.active });

      await service.deleteProduct("admin-1", "p1", false, {
        violationCode: "prohibited_item",
        note: "Yasaklı",
      });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { status: ProductStatus.deleted },
      });
      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.policy_violation,
          violationCode: "prohibited_item",
          detail: "Yasaklı",
          statusBefore: ProductStatus.active,
          statusAfter: ProductStatus.deleted,
          actorUserId: "admin-1",
        }),
      );
    });

    it("'diğer' kodu açıklamasız 400 döner, ilan kaldırılmaz", async () => {
      const { service, prisma } = makeService({ status: ProductStatus.active });

      await expect(
        service.deleteProduct("admin-1", "p1", false, {
          violationCode: "other",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("getProducts — kaldırma filtreleri", () => {
    it("neden ve kaldıran filtreleri statü sekmesini ezmeden AND'lenir", async () => {
      const { service, prisma } = makeService();

      await service.getProducts({
        status: ProductStatus.deleted,
        removalReason: "sold_elsewhere",
        removalActor: "seller",
      });

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(ProductStatus.deleted);
      expect(where.AND).toEqual([
        { removalReason: "sold_elsewhere" },
        {
          removalReason: {
            in: [
              "not_given",
              "changed_mind",
              "sold_elsewhere",
              "paused_temporarily",
            ],
          },
        },
      ]);
    });

    it("liste satırı güncel kaldırma özetini taşır, ham olay satırını taşımaz", async () => {
      const { service, prisma } = makeService();
      const removedAt = new Date("2026-10-01T10:00:00Z");
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([
        {
          id: "p1",
          sellerId: "seller-1",
          categoryId: "c1",
          price: 100,
          originalPrice: null,
          salePrice: null,
          status: ProductStatus.deleted,
          removalReason: ListingRemovalReason.sold_elsewhere,
          images: [],
          removalEvents: [
            {
              reason: ListingRemovalReason.sold_elsewhere,
              platform: "dolap",
              violationCode: null,
              createdAt: removedAt,
            },
          ],
        },
      ]);
      (service as any).discountService = {
        getEffectiveDisplayPrice: jest.fn().mockResolvedValue(null),
      };

      const result = await service.getProducts({});

      expect(result.data[0]).not.toHaveProperty("removalEvents");
      expect(result.data[0].removal).toEqual({
        reason: ListingRemovalReason.sold_elsewhere,
        actor: "seller",
        platform: "dolap",
        violationCode: null,
        removedAt: removedAt.toISOString(),
      });
    });
  });
});

describe("listingRemovalFilterWhere", () => {
  it("'bilinmiyor': kaldırma statüsünde ve nedeni kayıtsız", () => {
    expect(listingRemovalFilterWhere({ removalReason: "unknown" })).toEqual([
      {
        removalReason: null,
        status: { in: ["inactive", "deleted", "rejected", "suspended"] },
      },
    ]);
  });

  it("kaldıran = sistem / Tarodan → nedenin aktör grubu", () => {
    expect(listingRemovalFilterWhere({ removalActor: "system" })).toEqual([
      {
        removalReason: {
          in: [
            "expired",
            "out_of_stock",
            "return_quarantine",
            "seller_suspended",
          ],
        },
      },
    ]);
    expect(listingRemovalFilterWhere({ removalActor: "admin" })).toEqual([
      { removalReason: { in: ["policy_violation"] } },
    ]);
  });

  it("filtre yoksa koşul eklenmez", () => {
    expect(listingRemovalFilterWhere({})).toEqual([]);
  });
});

describe("toAdminRemovalSummary", () => {
  const at = new Date("2026-10-02T08:00:00Z");

  it("vitrindeki ilan için null", () => {
    expect(
      toAdminRemovalSummary({
        status: ProductStatus.active,
        removalReason: null,
      }),
    ).toBeNull();
  });

  it("nedeni kayıtsız eski kaldırma 'bilinmiyor' (reason null)", () => {
    expect(
      toAdminRemovalSummary({
        status: ProductStatus.inactive,
        removalReason: null,
        removalEvents: [],
      }),
    ).toEqual({
      reason: null,
      actor: null,
      platform: null,
      violationCode: null,
      removedAt: null,
    });
  });

  it("son olay güncel nedenle aynı değilse ayrıntısı yapıştırılmaz", () => {
    expect(
      toAdminRemovalSummary({
        status: ProductStatus.inactive,
        removalReason: ListingRemovalReason.out_of_stock,
        removalEvents: [
          {
            reason: ListingRemovalReason.sold_elsewhere,
            platform: "letgo",
            violationCode: null,
            createdAt: at,
          },
        ],
      }),
    ).toEqual({
      reason: ListingRemovalReason.out_of_stock,
      actor: "system",
      platform: null,
      violationCode: null,
      removedAt: null,
    });
  });
});

describe("toAdminRemovalSummary — güncel nedenin olayı", () => {
  it("son olay ezmeyen bir satıcı eylemiyse ayrıntı güncel nedeni taşıyan olaydan gelir", () => {
    const rejectedAt = new Date("2026-10-01T08:00:00Z");
    expect(
      toAdminRemovalSummary({
        status: ProductStatus.inactive,
        removalReason: ListingRemovalReason.policy_violation,
        removalEvents: [
          {
            reason: ListingRemovalReason.paused_temporarily,
            platform: null,
            violationCode: null,
            createdAt: new Date("2026-10-02T08:00:00Z"),
          },
          {
            reason: ListingRemovalReason.policy_violation,
            platform: null,
            violationCode: "prohibited_item",
            createdAt: rejectedAt,
          },
        ],
      }),
    ).toEqual({
      reason: ListingRemovalReason.policy_violation,
      actor: "admin",
      platform: null,
      violationCode: "prohibited_item",
      removedAt: rejectedAt.toISOString(),
    });
  });
});

describe("toAdminRemovalEvent", () => {
  it("aktörü nedenden türetir, serbest metni (yalnız admin ucu) taşır", () => {
    expect(
      toAdminRemovalEvent({
        id: "e1",
        reason: ListingRemovalReason.changed_mind,
        platform: null,
        violationCode: null,
        detail: "Satıcının notu",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        fromStorefront: true,
        actorUserId: "seller-1",
        createdAt: new Date("2026-10-03T09:00:00Z"),
      }),
    ).toEqual({
      id: "e1",
      reason: "changed_mind",
      actor: "seller",
      platform: null,
      violationCode: null,
      detail: "Satıcının notu",
      statusBefore: "active",
      statusAfter: "inactive",
      fromStorefront: true,
      actorUserId: "seller-1",
      createdAt: "2026-10-03T09:00:00.000Z",
    });
  });
});
