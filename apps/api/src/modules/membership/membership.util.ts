import { SubscriptionStatus, MembershipTierType } from '@prisma/client';

/**
 * Premium hakkı için TEK doğruluk kaynağı.
 *
 * Kural: ücretli tier (free değil) + ödenmiş/geçerli durum + dönem henüz bitmemiş.
 *   - active                         → premium
 *   - cancelled + currentPeriodEnd>now → premium ("süre bitince üyelik gider": iptal
 *     edilmiş ama ödenen dönem sürüyor; dönem sonunda cron free'ye düşürür)
 *   - past_due (ödeme ONAYLANMAMIŞ)   → premium DEĞİL (ödeme onaylanınca status=active olur)
 *   - expired / free / dönem geçmiş   → premium DEĞİL
 *
 * Bu helper olmadan kapılar status === 'active'e bakıp iptal-dönem-içi üyeyi yanlışlıkla
 * premium dışı sayıyordu (takas, sıralama, profil güven puanı, boost auto-renew vb.).
 */
export interface PremiumCheckMembership {
  status?: SubscriptionStatus | string | null;
  currentPeriodEnd?: Date | string | null;
  tier?: { type?: MembershipTierType | string | null } | null;
}

export function isPremiumEntitled(
  membership: PremiumCheckMembership | null | undefined,
): boolean {
  if (!membership || !membership.tier) return false;
  if (membership.tier.type === MembershipTierType.free) return false;
  if (
    membership.status !== SubscriptionStatus.active &&
    membership.status !== SubscriptionStatus.cancelled
  ) {
    return false;
  }
  if (membership.currentPeriodEnd == null) return false;
  return new Date(membership.currentPeriodEnd) > new Date();
}
