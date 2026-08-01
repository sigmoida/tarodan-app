import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";

/** Temp nesnesi bu süreden gençken ASLA silinmez (ilan taslağı hâlâ tamamlanabilir). */
const TEMP_MIN_AGE_DAYS = 7;

/**
 * Faz 0 — `products/product-images/temp/` temizliği, REFERANS-BİLİNÇLİ.
 *
 * Ürün oluşturma akışı görselleri ürün henüz YOKKEN temp'e yükler ve
 * ProductImage kaydı temp key'ini KALICI referanslar (taşıma yok). Kör bir
 * "eskiyi sil" cron'u canlı ürün görsellerini silerdi. Kural: yalnız
 * (a) TEMP_MIN_AGE_DAYS'ten eski VE (b) hiçbir ProductImage/MediaFile
 * kaydında geçmeyen nesneler silinir (terk edilmiş ilan taslakları).
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async cleanupTempProductImages(): Promise<{
    scanned: number;
    deleted: number;
  }> {
    const objects = await this.storage.listObjects(
      "products/product-images/temp/",
    );
    const cutoff = new Date(
      Date.now() - TEMP_MIN_AGE_DAYS * 24 * 60 * 60 * 1000,
    );

    let deleted = 0;
    for (const obj of objects) {
      if (obj.lastModified > cutoff) continue;

      // Referans kontrolü — canlı ürün görseli temp'te durabilir (taşıma yok).
      const inProduct = await this.prisma.productImage.findFirst({
        where: { OR: [{ cardKey: obj.key }, { detailKey: obj.key }] },
        select: { id: true },
      });
      if (inProduct) continue;
      const inMedia = await this.prisma.mediaFile.findFirst({
        where: { key: obj.key },
        select: { id: true },
      });
      if (inMedia) continue;

      await this.storage.deleteFileByKey(obj.key);
      deleted++;
    }

    if (deleted > 0) {
      this.logger.log(
        `Temp ürün görseli temizliği: ${objects.length} tarandı, ${deleted} sahipsiz nesne silindi`,
      );
    }
    return { scanned: objects.length, deleted };
  }
}
