import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import { computeProductContentFingerprint } from "../helpers/product-content-fingerprint";
import { ProductRenewalService } from "./product-renewal.service";

/**
 * Süresi dolmuş ilanın yenilenmesi: içerik son onaydan beri değişmediyse doğrudan
 * yayın, değiştiyse normal onay; eski kapıların (limit, komisyon, stok, satıcı
 * durumu) hepsi aynen çalışır.
 */
describe("ProductRenewalService", () => {
  const SELLER = "seller-1";

  const content = {
    title: "Hot Wheels Camaro",
    description: "Kutusunda",
    categoryId: "cat-1",
    brandId: "brand-1",
    carModelId: null,
    manufacturerId: "man-1",
    modelCode: null,
    condition: "new",
    images: [{ cardKey: "c1", detailKey: "d1", sortOrder: 0 }],
  };

  const makeProduct = (patch: Record<string, unknown> = {}) => ({
    id: "p1",
    sellerId: SELLER,
    kind: "listing",
    status: ProductStatus.inactive,
    inactiveReason: ProductInactiveReason.expired,
    quantity: 2,
    price: 150,
    approvedContentFingerprint: computeProductContentFingerprint(content),
    ...content,
    seller: {
      isBanned: false,
      businessStatus: null,
      companyName: null,
      taxId: null,
      membership: null,
    },
    ...patch,
  });

  const makeService = (
    products: Record<string, ReturnType<typeof makeProduct>> = {
      p1: makeProduct(),
    },
    opts: { canCreate?: () => { allowed: boolean }; updateCount?: number } = {},
  ) => {
    const prisma = {
      product: {
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            products[where.id] ?? null,
        ),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.updateCount ?? 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const searchService = {
      syncProduct: jest.fn().mockResolvedValue(undefined),
    };
    const membershipService = {
      canCreateListing: jest.fn(
        async () => opts.canCreate?.() ?? { allowed: true },
      ),
      getUserLimits: jest
        .fn()
        .mockResolvedValue({ tierName: "Ücretsiz", maxTotalListings: 3 }),
    };
    const commissionGuard = { assertListingRuleExists: jest.fn() };
    const service = new ProductRenewalService(
      prisma as any,
      cache as any,
      searchService as any,
      membershipService as any,
      commissionGuard as any,
    );
    return {
      service,
      prisma,
      cache,
      searchService,
      membershipService,
      commissionGuard,
    };
  };

  describe("renew — içerik değişmedi / değişti", () => {
    it("içerik son onaydakiyle aynıysa moderasyona girmeden yayına döner ve ömrü yeniden başlar", async () => {
      const { service, prisma } = makeService();

      await expect(service.renew(SELLER, "p1")).resolves.toEqual({
        id: "p1",
        status: ProductStatus.active,
      });

      const call = prisma.product.updateMany.mock.calls[0][0];
      // Yalnız hâlâ "süresi dolmuş" ilan yazılır (eşzamanlı değişikliğe karşı).
      expect(call.where).toEqual({
        id: "p1",
        status: ProductStatus.inactive,
        inactiveReason: ProductInactiveReason.expired,
      });
      expect(call.data.status).toBe(ProductStatus.active);
      expect(call.data.publishedAt).toBeInstanceOf(Date);
      expect(call.data.version).toEqual({ increment: 1 });
    });

    it("onaydan sonra içerik değiştiyse normal onay kuralı: pending, ömür onayda başlar", async () => {
      const { service, prisma } = makeService({
        p1: makeProduct({ title: "Sonradan değiştirilmiş başlık" }),
      });

      await expect(service.renew(SELLER, "p1")).resolves.toEqual({
        id: "p1",
        status: ProductStatus.pending,
      });

      const data = prisma.product.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe(ProductStatus.pending);
      expect(data).not.toHaveProperty("publishedAt");
    });

    it("görseli değişen ilan da onaya düşer", async () => {
      const { service } = makeService({
        p1: makeProduct({
          images: [{ cardKey: "c9", detailKey: "d9", sortOrder: 0 }],
        }),
      });
      await expect(service.renew(SELLER, "p1")).resolves.toMatchObject({
        status: ProductStatus.pending,
      });
    });

    it("onay izi olmayan (eski kayıt) ilan 'değişmedi' kanıtlanamadığı için onaya düşer", async () => {
      const { service } = makeService({
        p1: makeProduct({ approvedContentFingerprint: null }),
      });
      await expect(service.renew(SELLER, "p1")).resolves.toMatchObject({
        status: ProductStatus.pending,
      });
    });

    it("statü inactive dışına çıktığı için neden ELLE temizlenmez (middleware temizler)", async () => {
      const { service, prisma } = makeService();
      await service.renew(SELLER, "p1");
      expect(
        prisma.product.updateMany.mock.calls[0][0].data,
      ).not.toHaveProperty("inactiveReason");
    });

    it("yenileme sonrası önbellek, arama dizini ve ISR tazelenir", async () => {
      const { service, cache, searchService } = makeService();
      await service.renew(SELLER, "p1");
      expect(cache.del).toHaveBeenCalledWith("products:detail:p1");
      expect(cache.delPattern).toHaveBeenCalledWith("products:list:*");
      expect(searchService.syncProduct).toHaveBeenCalledWith("p1");
    });
  });

  describe("renew — eski kapılar aynen geçerli", () => {
    it("üyelik ilan limiti doluysa reddeder ve hiçbir şey yazmaz", async () => {
      const { service, prisma } = makeService(undefined, {
        canCreate: () => ({ allowed: false }),
      });

      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("komisyon kuralı yoksa reddeder ve hiçbir şey yazmaz", async () => {
      const { service, prisma, commissionGuard } = makeService();
      commissionGuard.assertListingRuleExists.mockRejectedValue(
        new BadRequestException("no rule"),
      );

      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("stok 0 ise reddeder", async () => {
      const { service, prisma } = makeService({
        p1: makeProduct({ quantity: 0 }),
      });
      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("banlı satıcı yenileyemez", async () => {
      const { service, prisma } = makeService({
        p1: makeProduct({
          seller: {
            isBanned: true,
            businessStatus: null,
            companyName: null,
            taxId: null,
            membership: null,
          },
        }),
      });
      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("limit kapısı içerik değişmemiş ilanda da çalışır (bypass moderasyondur, limit değil)", async () => {
      const { service, membershipService } = makeService();
      await service.renew(SELLER, "p1");
      expect(membershipService.canCreateListing).toHaveBeenCalledWith(SELLER);
    });
  });

  describe("renew — yalnız süresi dolmuş, kendi ilanı", () => {
    it.each([
      ["elle pasife alınmış", { inactiveReason: null }],
      [
        "iade karantinasında",
        { inactiveReason: ProductInactiveReason.return_quarantine },
      ],
      ["aktif", { status: ProductStatus.active, inactiveReason: null }],
      ["gerçek ilan değil", { kind: "membership" }],
    ])("%s ilanı yenilenemez", async (_label, patch) => {
      const { service, prisma } = makeService({ p1: makeProduct(patch) });
      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("başkasının ilanını yenileyemez", async () => {
      const { service, prisma } = makeService();
      await expect(service.renew("someone-else", "p1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("olmayan ilan 404", async () => {
      const { service } = makeService();
      await expect(service.renew(SELLER, "nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("okuma ile yazma arasında ilan değiştiyse (0 satır) 409", async () => {
      const { service, searchService } = makeService(undefined, {
        updateCount: 0,
      });
      await expect(service.renew(SELLER, "p1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(searchService.syncProduct).not.toHaveBeenCalled();
    });
  });

  describe("renewMany — kısmi başarı raporu", () => {
    it("her ilan kendi sonucuyla döner; biri düşünce diğerleri etkilenmez", async () => {
      const { service } = makeService({
        a: makeProduct({ id: "a" }),
        b: makeProduct({ id: "b", title: "Değişmiş" }), // onaya düşer
        c: makeProduct({ id: "c", inactiveReason: null }), // süresi dolmamış → hata
      });

      const result = await service.renewMany(SELLER, ["a", "b", "c", "yok"]);

      expect(result.renewed).toBe(1);
      expect(result.submitted).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.results).toEqual([
        { id: "a", ok: true, status: ProductStatus.active },
        { id: "b", ok: true, status: ProductStatus.pending },
        { id: "c", ok: false, errorKey: "server.product.renewNotExpired" },
        { id: "yok", ok: false, errorKey: "server.product.notFound" },
      ]);
    });

    it("limit yarı yolda dolarsa kalanlar gerekçesiyle başarısız olur (sıralı denetim)", async () => {
      let remaining = 2;
      const { service, prisma } = makeService(
        {
          a: makeProduct({ id: "a" }),
          b: makeProduct({ id: "b" }),
          c: makeProduct({ id: "c" }),
        },
        {
          // Her başarılı yazım limiti bir tüketir: paralel koşu bunu göremezdi.
          canCreate: () => ({ allowed: remaining > 0 }),
        },
      );
      prisma.product.updateMany.mockImplementation(async () => {
        remaining -= 1;
        return { count: 1 };
      });

      const result = await service.renewMany(SELLER, ["a", "b", "c"]);

      expect(result.results.map((r) => r.ok)).toEqual([true, true, false]);
      expect(result.results[2]).toMatchObject({
        id: "c",
        errorKey: "server.product.listingLimitReached",
        errorParams: { tierName: "Ücretsiz", maxListings: 3 },
      });
      expect(result.renewed).toBe(2);
      expect(result.failed).toBe(1);
    });

    it("tekrar eden id bir kez işlenir", async () => {
      const { service, prisma } = makeService();
      const result = await service.renewMany(SELLER, ["p1", "p1", "p1"]);
      expect(result.results).toHaveLength(1);
      expect(prisma.product.updateMany).toHaveBeenCalledTimes(1);
    });

    it("beklenmeyen hata genel anahtara düşer, diğer ilanlar yenilenir", async () => {
      const { service, prisma } = makeService({
        a: makeProduct({ id: "a" }),
        b: makeProduct({ id: "b" }),
      });
      prisma.product.updateMany
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.renewMany(SELLER, ["a", "b"]);

      expect(result.results[0]).toEqual({
        id: "a",
        ok: false,
        errorKey: "server.product.renewFailed",
      });
      expect(result.results[1]).toMatchObject({ id: "b", ok: true });
    });
  });

  describe("reactivateByAdmin", () => {
    it("yönetici kararı onay sayılır: doğrudan yayın + güncel içerik onaylı olarak damgalanır", async () => {
      // İçerik izi tutmasa bile (eski kayıt) yönetici yayına alabilir.
      const { service, prisma } = makeService({
        p1: makeProduct({ approvedContentFingerprint: null }),
      });
      // damga: findUnique güncel içeriği, update izi yazar
      await service.reactivateByAdmin("p1");

      expect(prisma.product.updateMany.mock.calls[0][0].data.status).toBe(
        ProductStatus.active,
      );
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: {
          approvedContentFingerprint: computeProductContentFingerprint(content),
        },
      });
    });

    it("kapılar yine çalışır: limit doluysa yayına almaz", async () => {
      const { service, prisma } = makeService(undefined, {
        canCreate: () => ({ allowed: false }),
      });
      await expect(service.reactivateByAdmin("p1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe("markExpired", () => {
    it("yalnız pasif + nedeni boş + gerçek ilanı işaretler; statüye dokunmaz", async () => {
      const { service, prisma } = makeService();
      prisma.product.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(service.markExpired(["a", "b"])).resolves.toEqual(["a"]);

      expect(prisma.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: "a",
          kind: "listing",
          status: ProductStatus.inactive,
          inactiveReason: null,
        },
        data: { inactiveReason: ProductInactiveReason.expired },
      });
    });

    it("stampBaseline açıkken işaretlenenin güncel içeriğini onaylı sayar", async () => {
      const { service, prisma } = makeService();
      await service.markExpired(["p1"], { stampBaseline: true });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: {
          approvedContentFingerprint: computeProductContentFingerprint(content),
        },
      });
    });

    it("varsayılanda iz yazmaz (yenileme normal onay kuralından geçer)", async () => {
      const { service, prisma } = makeService();
      await service.markExpired(["p1"]);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });
});
