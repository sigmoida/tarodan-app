import type { Prisma } from "@prisma/client";

/**
 * "Reklam şu an yayında mı" — TEK kural. Hem vitrin seçimi (`GET /ads/active`)
 * hem tık/gösterim sayımı bunu kullanır: yayında olmayan bir reklama sayaç
 * yazılması (eski sekme, önbellekteki sayfa, elle atılan istek) istatistiği
 * şişiriyordu.
 *
 * Yayında = admin anahtarı açık + tarih penceresinin içinde + (bağlıysa)
 * kampanya da canlı. Kampanya bitince/durunca duyuru kendiliğinden düşer:
 * yayından kaldırmayı admin'in hatırlamasına bırakmayız.
 */

/** Kural için gereken kampanya alanları (Discount'tan seçilen alt küme). */
export interface AdLiveCampaign {
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  budgetStoppedAt: Date | null;
}

/** Kural için gereken reklam alanları. */
export interface AdLiveFields {
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  discount?: AdLiveCampaign | null;
}

/** Kampanya alanlarının Prisma `select`'i — kural ile sorgu aynı alanları okur. */
export const AD_LIVE_CAMPAIGN_SELECT = {
  isActive: true,
  startDate: true,
  endDate: true,
  budgetStoppedAt: true,
} as const satisfies Prisma.DiscountSelect;

/** Pencere sınırları dahil: başlangıç anında ve bitiş anında reklam yayındadır. */
function withinWindow(
  now: Date,
  start: Date | null,
  end: Date | null,
): boolean {
  if (start && start.getTime() > now.getTime()) return false;
  if (end && end.getTime() < now.getTime()) return false;
  return true;
}

export function isAdLive(ad: AdLiveFields, now: Date = new Date()): boolean {
  if (!ad.isActive) return false;
  if (!withinWindow(now, ad.startDate, ad.endDate)) return false;
  const campaign = ad.discount;
  if (!campaign) return true;
  if (!campaign.isActive || campaign.budgetStoppedAt) return false;
  return withinWindow(now, campaign.startDate, campaign.endDate);
}

/**
 * `isAdLive`'ın veritabanında süzülebilen kısmı (anahtar + pencere). Yalnız
 * daraltma içindir — otorite `isAdLive`'dır, sonuç yine ondan geçirilir.
 */
export function adLiveWhere(now: Date): Prisma.AdvertisementWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: now } }] },
      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
    ],
  };
}
