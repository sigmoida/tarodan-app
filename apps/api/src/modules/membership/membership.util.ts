import {
  BusinessStatus,
  SubscriptionStatus,
  MembershipTierType,
} from "@prisma/client";

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
  tier?: {
    type?: MembershipTierType | string | null;
    isActive?: boolean | null;
  } | null;
}

export interface BusinessEntitlementOwner {
  businessStatus?: BusinessStatus | string | null;
  companyName?: string | null;
  taxId?: string | null;
}

export function isPremiumEntitled(
  membership: PremiumCheckMembership | null | undefined,
  owner?: BusinessEntitlementOwner | null,
): boolean {
  if (!membership || !membership.tier) return false;
  if (membership.tier.type === MembershipTierType.free) return false;
  if (membership.tier.isActive === false) return false;
  if (
    membership.status !== SubscriptionStatus.active &&
    membership.status !== SubscriptionStatus.cancelled
  ) {
    return false;
  }
  if (membership.currentPeriodEnd == null) return false;
  if (new Date(membership.currentPeriodEnd) <= new Date()) return false;

  if (membership.tier.type === MembershipTierType.business) {
    if (!owner) return false;
    return (
      owner.businessStatus === BusinessStatus.approved &&
      !!owner.companyName?.trim() &&
      !!owner.taxId?.trim()
    );
  }

  return true;
}

export function effectiveMembershipTierType(
  membership: PremiumCheckMembership | null | undefined,
  owner?: BusinessEntitlementOwner | null,
): MembershipTierType {
  if (
    membership?.tier?.type === MembershipTierType.free ||
    isPremiumEntitled(membership, owner)
  ) {
    return (membership?.tier?.type ??
      MembershipTierType.free) as MembershipTierType;
  }

  return MembershipTierType.free;
}

export function isBusinessMembershipEntitled(
  membership: PremiumCheckMembership | null | undefined,
  owner: BusinessEntitlementOwner | null | undefined,
): boolean {
  return (
    membership?.tier?.type === MembershipTierType.business &&
    isPremiumEntitled(membership, owner)
  );
}
