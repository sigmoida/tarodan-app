import { ForbiddenException } from "@nestjs/common";
import { ProductStatus } from "@prisma/client";
import { ProductUpdateService } from "./product-update.service";

/**
 * İlanı yalnız sahibi düzenleyebiliyordu; destek ekibi satıcı adına düzeltme
 * yapamıyor, her seferinde satıcıya dönmek zorunda kalıyordu.
 *
 * Sahiplik kontrolü bir GUARD değil, servis içi iş kuralıdır (apps/api/CLAUDE.md
 * §9: "decorator'lar erişimi, servisler sahipliği yönetir"). Bu yüzden aktör
 * ayrımı da burada sabitlenir: yönetici sahiplik ve üyelik kapılarını geçer,
 * satıcı geçemez.
 */
describe("ProductUpdateService — aktör kapıları", () => {
  const OWNER = "seller-owner";

  const makeService = (overrides: { isBanned?: boolean } = {}) => {
    const product = {
      id: "p1",
      sellerId: OWNER,
      status: ProductStatus.active,
      quantity: 3,
      price: 100,
      categoryId: "c1",
      title: "Eski",
      images: [],
    };
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isBanned: overrides.isBanned ?? false,
          businessStatus: null,
          companyName: null,
          taxId: null,
          membership: null,
        }),
      },
    };
    const service = new ProductUpdateService(
      prisma as any,
      {} as any, // cache
      {} as any, // searchService
      {} as any, // notificationService
      {} as any, // smtpProvider
      {} as any, // common
      {} as any, // ranking
      {} as any, // membershipService
      {} as any, // commissionGuard
      { isEnabled: false, assertTextClean: jest.fn() } as any,
    );
    return { service, prisma };
  };

  it("başkasının ilanını düzenlemeye çalışan satıcı reddedilir", async () => {
    const { service } = makeService();

    await expect(
      service.update("p1", "baska-satici", { title: "Yeni" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("yönetici başkasının ilanında sahiplik kapısına TAKILMAZ", async () => {
    const { service } = makeService();

    // Gövde mock'lanmadığı için ilerisi patlar; ölçtüğümüz şey sahiplik
    // kapısının artık yolu KESMEMESİ.
    const err = await service
      .updateAsAdmin("p1", "admin-1", { title: "Yeni" } as never)
      .catch((e) => e);

    expect(err).not.toBeInstanceOf(ForbiddenException);
  });

  it("banlı satıcı kendi ilanını düzenleyemez", async () => {
    const { service } = makeService({ isBanned: true });

    await expect(
      service.update("p1", OWNER, { title: "Yeni" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("yönetici BANLI satıcının ilanını düzeltebilir", async () => {
    const { service } = makeService({ isBanned: true });

    const err = await service
      .updateAsAdmin("p1", "admin-1", { title: "Yeni" } as never)
      .catch((e) => e);

    expect(err).not.toBeInstanceOf(ForbiddenException);
  });

  it("yönetici yolunda da üyelik/limit sorgusu SAHİBİN kimliğiyle yapılır", async () => {
    const { service, prisma } = makeService();

    await service
      .updateAsAdmin("p1", "admin-1", { title: "Yeni" } as never)
      .catch(() => undefined);

    // Görsel klasörü, üyelik sınırı ve moderasyon kaydı ilanın SAHİBİNE aittir;
    // düzenlemeyi yapan yöneticiye değil.
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OWNER } }),
    );
  });
});
