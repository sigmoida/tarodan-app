import { Logger } from "@nestjs/common";
import {
  CommissionSellerType,
  MembershipTierType,
  SellerType,
} from "@prisma/client";

/**
 * Saf komisyon kuralı eşleştirme/hesap yardımcıları — OrderService.calculateCommission
 * bunları kullanır. DB erişimi yok; unit testte doğrudan çağrılabilir.
 */

/**
 * Find matching commission rule by specificity
 * Order: 1) cat+type, 2) cat+ALL (kategori öncelikli), 3) type-only, 4) ALL+NULL
 * Each level can only have one rule (validated in admin service)
 */
export function findMatchingCommissionRule(
  rules: any[],
  categoryId: string | null | undefined,
  sellerType: CommissionSellerType,
  logger?: Logger,
): any | null {
  // 1. categoryId + sellerType (most specific)
  if (categoryId) {
    const exact = rules.find(
      (r) => r.categoryId === categoryId && r.sellerType === sellerType,
    );
    if (exact) {
      logger?.debug(
        `Matched exact rule: category=${categoryId}, sellerType=${sellerType}`,
      );
      return exact;
    }
  }

  // 2. categoryId + ALL (category priority - more specific than seller type)
  // NOT: sellerType null = "tüm satıcı tipleri" (ALL ile eşdeğer). Alıcı hizmet bedeli
  // kuralları sellerType'sız oluşturulur; null'ı ALL gibi ele almazsak hiç eşleşmez.
  if (categoryId) {
    const catAll = rules.find(
      (r) =>
        r.categoryId === categoryId &&
        (r.sellerType === CommissionSellerType.ALL || r.sellerType == null),
    );
    if (catAll) {
      logger?.debug(
        `Matched category rule: category=${categoryId}, sellerType=ALL`,
      );
      return catAll;
    }
  }

  // 3. categoryId IS NULL + sellerType
  const typeOnly = rules.find(
    (r) => r.categoryId === null && r.sellerType === sellerType,
  );
  if (typeOnly) {
    logger?.debug(`Matched seller type rule: sellerType=${sellerType}`);
    return typeOnly;
  }

  // 4. categoryId IS NULL + ALL (default) — sellerType null da ALL sayılır (alıcı hizmet bedeli)
  const defaultRule = rules.find(
    (r) =>
      r.categoryId === null &&
      (r.sellerType === CommissionSellerType.ALL || r.sellerType == null),
  );

  if (defaultRule) {
    logger?.debug("Using default commission rule (ALL+NULL)");
    return defaultRule;
  }

  return null;
}

/**
 * Clamp amount between min and max
 */
export function clampCommissionAmount(
  raw: number,
  min: number | null,
  max: number | null,
): number {
  let val = raw;
  if (min != null && val < min) val = min;
  if (max != null && val > max) val = max;
  return Math.round(val * 100) / 100;
}

/**
 * Map seller attributes to the commission rule buckets.
 * Paid membership takes precedence over the account-level seller type:
 * - business membership -> BUSINESS
 * - premium membership -> PREMIUM
 * - platform seller without a paid membership -> BUSINESS
 * - free/basic membership or individual/verified seller -> FREE
 */
export function mapSellerTypeForCommission(
  userSellerType: SellerType | null,
  membershipTier: MembershipTierType | null,
): CommissionSellerType {
  if (membershipTier === MembershipTierType.business) {
    return CommissionSellerType.BUSINESS;
  }

  if (membershipTier === MembershipTierType.premium) {
    return CommissionSellerType.PREMIUM;
  }

  // Platform sellers -> BUSINESS
  if (userSellerType === SellerType.platform) {
    return CommissionSellerType.BUSINESS;
  }

  // Individual/Verified -> FREE
  return CommissionSellerType.FREE;
}
