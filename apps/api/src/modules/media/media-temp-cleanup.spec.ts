import { MediaCleanupService } from "./media-cleanup.service";

/**
 * Faz 0 — temp temizliği REFERANS-BİLİNÇLİ olmak zorunda: ürün oluşturma akışı
 * görselleri ürün YOKKEN `product-images/temp/`e yükler ve ProductImage kaydı
 * temp key'ini KALICI referanslar (taşıma yok). Kör bir "eskiyi sil" cron'u
 * canlı ürün görsellerini silerdi. Kural: yalnız (a) yeterince eski VE
 * (b) hiçbir ProductImage/MediaFile kaydında geçmeyen temp nesneleri silinir.
 */

const OLD = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
const FRESH = new Date(Date.now() - 60 * 60 * 1000);

function makeHarness(opts: {
  objects: Array<{ key: string; lastModified: Date }>;
  referencedKeys?: string[];
}) {
  const referenced = new Set(opts.referencedKeys ?? []);
  const prisma = {
    productImage: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            referenced.has(where.OR[0].cardKey) ? { id: "pi" } : null,
          ),
        ),
    },
    mediaFile: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(referenced.has(where.key) ? { id: "mf" } : null),
        ),
    },
  };
  const storage = {
    listObjects: jest.fn().mockResolvedValue(opts.objects),
    deleteFileByKey: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MediaCleanupService(prisma as any, storage as any);
  return { service, prisma, storage };
}

describe("MediaCleanupService.cleanupTempProductImages", () => {
  it("deletes only OLD and UNREFERENCED temp objects", async () => {
    const { service, storage } = makeHarness({
      objects: [
        {
          key: "dev/products/product-images/temp/orphan.webp",
          lastModified: OLD,
        },
        {
          key: "dev/products/product-images/temp/live.webp",
          lastModified: OLD,
        },
        {
          key: "dev/products/product-images/temp/fresh.webp",
          lastModified: FRESH,
        },
      ],
      referencedKeys: ["dev/products/product-images/temp/live.webp"],
    });

    const r = await service.cleanupTempProductImages();

    expect(r.deleted).toBe(1);
    expect(storage.deleteFileByKey).toHaveBeenCalledTimes(1);
    expect(storage.deleteFileByKey).toHaveBeenCalledWith(
      "dev/products/product-images/temp/orphan.webp",
    );
  });

  it("does nothing when temp is empty", async () => {
    const { service, storage } = makeHarness({ objects: [] });

    const r = await service.cleanupTempProductImages();

    expect(r.deleted).toBe(0);
    expect(storage.deleteFileByKey).not.toHaveBeenCalled();
  });
});
