/** @format */

/** Sunucunun katman değişimini yansıtmasını beklerken yoklama sayısı ve aralığı. */
export const MEMBERSHIP_SETTLE_ATTEMPTS = 5;
export const MEMBERSHIP_SETTLE_INTERVAL_MS = 2000;

/**
 * Üyelik değişimi sunucuya yansıdı mı. PayTR dönüşünde `/membership/success`a
 * sunucu tarafında ödeme doğrulanmadan gelinebilir (katman geç değişir); bu
 * yüzden tek bir tazeleme eski `isAdFree`'yi 5 dk önbellekte bırakırdı.
 *
 *  - Hedef katman biliniyorsa (URL `tier=`): katman ona eşitse yansımıştır.
 *  - Bilinmiyorsa (PayTR dönüşü): önceki katmandan FARKLI olması yansımıştır.
 *  - Önceki katman da bilinmiyorsa karşılaştıracak bir şey yok → ilk yanıt yeter.
 */
export function isMembershipSettled(input: {
  tier: string | null | undefined;
  expectedTier?: string | null;
  baselineTier?: string | null;
}): boolean {
  if (input.expectedTier) return input.tier === input.expectedTier;
  if (input.baselineTier) return input.tier !== input.baselineTier;
  return true;
}
