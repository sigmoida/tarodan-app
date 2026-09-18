import type { AnalyticsStampKey, AnalyticsStampTruncation } from "@tarodan/types";
import type { DashboardDateWindow } from "../dashboard-period.helper";

/**
 * Damgaların ne zamandan beri yazıldığı — TEK kaynak.
 *
 * Bu damgaların hiçbiri GERİYE DÖNÜK DOLDURULMADI; `updatedAt` geçişten
 * sonraki her dokunuşla kaydığı için yazılacak dürüst bir değer yok. Sonuç:
 * damga eklenmeden önceki olaylar üzerine kurulu metrikte GÖRÜNMEZ ve kısa bir
 * geçmiş, gerçek bir düşüş gibi okunur. Ekran bunu söylemek zorunda.
 *
 * Tarih, damgayı getiren GÖÇÜN gününün başına yuvarlanır (göç klasörünün adı
 * yorumda). Aşağı yuvarlanması bilinçli: uyarıyı gereğinden az göstermektense
 * biraz fazla göstermek yanlış okumaya yol açmaz.
 */
export const ANALYTICS_STAMP_SINCE: Record<AnalyticsStampKey, string> = {
  // 20260918100000_order_cancelled_at_and_dashboard_indexes
  orderCancelledAt: "2026-09-18T00:00:00.000Z",
  // 20260918110000_analytics_event_stamps_and_indexes
  tradeRejectedAt: "2026-09-18T00:00:00.000Z",
  productSoldAt: "2026-09-18T00:00:00.000Z",
  offerRespondedAt: "2026-09-18T00:00:00.000Z",
  membershipPastDueAt: "2026-09-18T00:00:00.000Z",
};

/**
 * Seçilen pencere, verilen damgaların başladığı andan ÖNCESİNE uzanıyor mu.
 *
 * Her sekme ölçtüğü damgaları sayar; uyarı metni ve biçimi ekranda tek yerde
 * durur, yani dört ayrı "şu tarihten beri" cümlesi yazılmaz.
 */
export function stampTruncations(
  window: DashboardDateWindow,
  stamps: readonly AnalyticsStampKey[],
): AnalyticsStampTruncation[] {
  const from = window.gte.toISOString();
  return stamps
    .filter((stamp) => from < ANALYTICS_STAMP_SINCE[stamp])
    .map((stamp) => ({ stamp, since: ANALYTICS_STAMP_SINCE[stamp] }));
}
