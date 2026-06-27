import type { CronTrackerService } from './cron-tracker.service';

/**
 * Decorator ile servis arasındaki köprü.
 *
 * `@TrackedCron` bir method decorator'ı; Nest DI'ya doğrudan erişemez. Servis
 * oluşturulduğunda kendini buraya kaydeder, decorator da çalışırken buradan
 * okur. Ayrı dosyada tutulur ki decorator <-> servis arası döngüsel import
 * oluşmasın.
 *
 * Fail-safe: tracker henüz set edilmemişse decorator işi sarmadan, orijinal
 * cron'u olduğu gibi çalıştırır (cron asla tracking yüzünden aksamaz).
 */
let trackerRef: CronTrackerService | null = null;

export function setCronTracker(tracker: CronTrackerService): void {
  trackerRef = tracker;
}

export function getCronTracker(): CronTrackerService | null {
  return trackerRef;
}
