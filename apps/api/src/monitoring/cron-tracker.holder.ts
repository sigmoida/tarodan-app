import type { CronTrackerService } from "./cron-tracker.service";

/**
 * CronTracker köprüsü — servis örneği ile onu kullanan yardımcılar arasında.
 *
 * `runTrackedJob` (Bull cron yürütme yolu — Faz 7.5) DI'ya doğrudan erişemez;
 * CronTrackerService oluşturulduğunda kendini buraya kaydeder, yardımcı da
 * çalışırken buradan okur. Ayrı dosyada tutulur ki döngüsel import oluşmasın.
 *
 * Fail-safe: tracker henüz set edilmemişse iş sarılmadan olduğu gibi çalışır
 * (cron asla tracking yüzünden aksamaz).
 */
let trackerRef: CronTrackerService | null = null;

export function setCronTracker(tracker: CronTrackerService): void {
  trackerRef = tracker;
}

export function getCronTracker(): CronTrackerService | null {
  return trackerRef;
}
