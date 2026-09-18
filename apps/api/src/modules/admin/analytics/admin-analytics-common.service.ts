import { Injectable, Optional } from "@nestjs/common";
import { StorageService } from "../../storage/storage.service";

/**
 * Analitik & raporlar için gruplar-arası paylaşılan leaf yardımcı —
 * AdminAnalyticsService'ten birebir taşındı: ürün görsel URL çözümü
 * (resolveProductImageUrl, order grubu) tek yerde toplanır. Leaf: yalnız
 * @Optional() StorageService enjekte eder, başka admin alt servisine
 * bağlanmaz (döngü yok).
 *
 * Tarih gruplama anahtarı (`getDateKey`) BURADAN KALKTI: kovaları sürecin
 * saat diliminde kesip anahtarı `toISOString()` ile (UTC) üretiyordu, yani
 * aynı satır iki farklı güne düşebiliyordu. Kovalar artık SQL'de, Türkiye
 * takviminde kesiliyor (`analytics-shapes.helper.ts`).
 */
@Injectable()
export class AdminAnalyticsCommonService {
  constructor(
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }
}
