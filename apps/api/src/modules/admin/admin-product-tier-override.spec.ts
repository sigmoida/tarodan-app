import { ShippingPackageTierCode } from "@prisma/client";
import { AdminProductService } from "./admin-product.service";

/**
 * Satıcı ilanda üç boyuttan birini seçiyor ve doğrudan fiyatı etkiliyor: buzdolabına
 * "Küçük Paket" demek 160 TL yerine 100 TL yazdırır ve farkı platform üstlenir
 * (Sürat faturası platforma gelir). Bu yüzden adminin kademeyi düzeltebilmesi ve
 * düzeltmenin denetim kaydına düşmesi gerekiyor.
 *
 * Kademe düzeltilince `shippingDesi` de TÜRETİLİR — ikisi ayrışırsa paket desisi
 * toplamı yanlış kademeye düşer.
 */
describe("AdminProductService — package tier override", () => {
  const makeService = () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: "p1",
          shippingPackageTier: ShippingPackageTierCode.small,
          shippingDesi: 2,
        }),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: "p1",
            ...data,
            category: null,
            seller: null,
            images: [],
          }),
        ),
      },
    } as any;
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminProductService(
      prisma,
      audit as any,
      {} as any, // discountService
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any, // searchService
      { del: jest.fn(), delPattern: jest.fn() } as any, // cache
      {} as any, // notificationService
      undefined as any, // storageService (@Optional)
    );
    return { service, prisma, audit };
  };

  it("kademeyi düzeltir ve desiyi kademeden TÜRETİR", async () => {
    const { service, prisma } = makeService();

    await service.updateProduct("admin-1", "p1", {
      shippingPackageTier: ShippingPackageTierCode.large,
    } as any);

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingPackageTier: ShippingPackageTierCode.large,
          // Büyük paketin temsilci desisi 10.
          shippingDesi: 10,
        }),
      }),
    );
  });

  it("kademe düzeltmesi denetim kaydına düşer", async () => {
    const { service, audit } = makeService();

    await service.updateProduct("admin-1", "p1", {
      shippingPackageTier: ShippingPackageTierCode.medium,
    } as any);

    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      expect.any(String),
      "Product",
      "p1",
      expect.anything(),
      expect.anything(),
    );
  });

  it("kademe gönderilmediyse desiye dokunulmaz", async () => {
    const { service, prisma } = makeService();

    await service.updateProduct("admin-1", "p1", { title: "Yeni ad" } as any);

    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.shippingPackageTier).toBeUndefined();
    expect(data.shippingDesi).toBeUndefined();
  });
});
