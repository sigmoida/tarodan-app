import { ShippingPackageTierCode } from "@prisma/client";
import { AdminProductService } from "./admin-product.service";

/**
 * Satıcı ilanda üç boyuttan birini seçiyor ve doğrudan fiyatı etkiliyor: buzdolabına
 * "Küçük Paket" demek 160 TL yerine 100 TL yazdırır ve farkı platform üstlenir
 * (Sürat faturası platforma gelir). Bu yüzden adminin kademeyi düzeltebilmesi ve
 * düzeltmenin denetim kaydına düşmesi gerekiyor.
 *
 * Yazma İŞİ artık domain servisinde (`ProductService.updateAsAdmin`): kademeden
 * desi türetimi orada, satıcı yoluyla AYNI yardımcıdan yapılır
 * (`productShippingTierData`). Buradaki eski kopya kaldırıldı — o kopya
 * komisyon, görsel sahipliği ve iyimser kilit denetimlerinin hiçbirini
 * yapmıyordu. Bu spec artık yöneticiye ÖZGÜ olan iki şeyi sabitler: isteğin
 * domain servisine olduğu gibi geçmesi ve denetim kaydının düşmesi.
 */
describe("AdminProductService — package tier override", () => {
  const makeService = () => {
    const before = {
      id: "p1",
      shippingPackageTier: ShippingPackageTierCode.small,
      shippingDesi: 2,
    };
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(before) },
    } as any;
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const productService = {
      updateAsAdmin: jest.fn().mockResolvedValue({ id: "p1", updated: true }),
    };
    const service = new AdminProductService(
      prisma,
      audit as any,
      {} as any, // discountService
      {} as any, // searchService
      {} as any, // cache
      {} as any, // notificationService
      undefined as any, // storageService (@Optional)
      { assertListingRuleExists: jest.fn() } as any,
      productService as any,
      {} as any, // mediaService — görsel yükleme bu testlerin konusu değil
      {} as any, // membershipService
    );
    return { service, prisma, audit, productService, before };
  };

  it("kademe düzeltmesini domain servisine devreder", async () => {
    const { service, productService } = makeService();

    await service.updateProduct("admin-1", "p1", {
      shippingPackageTier: ShippingPackageTierCode.large,
    } as any);

    // Desi TÜRETİMİ domain servisinin işi; burada isteğin bozulmadan geçmesi
    // ve yöneticinin kimliğinin taşınması sabitlenir.
    expect(productService.updateAsAdmin).toHaveBeenCalledWith("p1", "admin-1", {
      shippingPackageTier: ShippingPackageTierCode.large,
    });
  });

  it("kademe düzeltmesi denetim kaydına düşer", async () => {
    const { service, audit, before } = makeService();

    const result = await service.updateProduct("admin-1", "p1", {
      shippingPackageTier: ShippingPackageTierCode.medium,
    } as any);

    // Denetim kaydı ÖNCE/SONRA halini taşımalı: yöneticinin neyi değiştirdiği
    // sonradan yalnız buradan okunabiliyor.
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "product_update",
      "Product",
      "p1",
      before,
      result,
    );
  });

  it("ürün yoksa yazma yoluna hiç girmez", async () => {
    const { service, prisma, productService } = makeService();
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(
      service.updateProduct("admin-1", "yok", { title: "x" } as any),
    ).rejects.toThrow();

    expect(productService.updateAsAdmin).not.toHaveBeenCalled();
  });
});
