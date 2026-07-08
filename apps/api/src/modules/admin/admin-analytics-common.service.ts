import { Injectable, Optional } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AnalyticsGroupBy } from './dto';

/**
 * Analitik & raporlar için gruplar-arası paylaşılan leaf yardımcı(lar) —
 * AdminAnalyticsService'ten birebir taşındı. Ürün görsel URL çözümü
 * (resolveProductImageUrl, order grubu) ve tarih gruplama anahtarı
 * (getDateKey, dashboard grubu) tek yerde toplanır; dashboard/order alt
 * servisleri buraya delege eder. Leaf: yalnız @Optional() StorageService
 * enjekte eder, başka admin alt servisine bağlanmaz (döngü yok).
 */
@Injectable()
export class AdminAnalyticsCommonService {
  constructor(
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  getDateKey(date: Date, groupBy?: AnalyticsGroupBy): string {
    const d = new Date(date);
    switch (groupBy) {
      case AnalyticsGroupBy.week:
        // Get Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      case AnalyticsGroupBy.month:
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      case AnalyticsGroupBy.day:
      default:
        return d.toISOString().split('T')[0];
    }
  }
}
