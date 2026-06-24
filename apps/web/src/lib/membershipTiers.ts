/**
 * Üyelik kademe (tier) sıralaması ve değişim türü yardımcıları.
 * Mesajlarda yükseltme / düşürme / değiştirme ayrımı için kullanılır.
 */

export const TIER_RANK: Record<string, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  business: 3,
};

export type TierChangeKind = 'upgrade' | 'downgrade' | 'change';

/** Mevcut tier'dan hedef tier'a geçişin türü. Bilinmeyen tier 'free' kabul edilir. */
export function tierChangeKind(from?: string | null, to?: string | null): TierChangeKind {
  const f = TIER_RANK[(from ?? 'free').toLowerCase()] ?? 0;
  const t = TIER_RANK[(to ?? 'free').toLowerCase()] ?? 0;
  if (t > f) return 'upgrade';
  if (t < f) return 'downgrade';
  return 'change';
}
