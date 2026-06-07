/**
 * Harmanlanmış (composite) Relevance Skoru — varsayılan/"Önerilen" sıralamada kullanılır.
 *
 * Amaç: Öne çıkan (boost) ve premium ilanlar NORMALDE önde olsun; ama gerçekten çok
 * etkileşim almış (çok görüntülenme/favori/mesaj) bir ürün de geri kalmasın — yeterince
 * popülerse boost'luyu geçebilsin. (Kesin kademe DEĞİL; tek sayısal skor.)
 *
 * relevanceScore =
 *   boost/premium bonusu (rankTier'a göre)
 * + qualityScore * 100        (kademe içinde kalite eşitlik bozucu, max ~8500)
 * + popularityScore           (etkileşim: görüntülenme + favori + mesaj + satış + son aktivite)
 *
 * Bonus büyüklükleri tunable: BOOST_BONUS'u büyütmek boost'u "her zaman en üstte"ye yaklaştırır.
 * Boost'un GARANTİ görünürlüğü ayrıca ana ekrandaki "Öne Çıkan" şeridiyle sağlanır.
 */
export const RELEVANCE_BOOST_BONUS = 100000; // aktif boost (rankTier=2)
export const RELEVANCE_PREMIUM_BONUS = 20000; // premium/ücretli satıcı (rankTier=1)
export const RELEVANCE_QUALITY_WEIGHT = 100;

export function relevanceTierBonus(rankTier: number): number {
  if (rankTier >= 2) return RELEVANCE_BOOST_BONUS;
  if (rankTier === 1) return RELEVANCE_PREMIUM_BONUS;
  return 0;
}

export function computeRelevanceScore(input: {
  rankTier: number;
  qualityScore: number;
  popularityScore?: number | null;
}): number {
  const tierBonus = relevanceTierBonus(input.rankTier ?? 0);
  const qualityPart = (input.qualityScore ?? 0) * RELEVANCE_QUALITY_WEIGHT;
  const popularity = Math.max(0, input.popularityScore ?? 0);
  return tierBonus + qualityPart + popularity;
}
