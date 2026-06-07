/**
 * İlan Kalite Skoru (Listing Quality Score)
 *
 * Belge gereği boost'lu ve premium ilanların kendi kademeleri içinde sıralanmasında
 * kullanılır. Bileşenler:
 *  - Fotoğraf sayısı (çok foto → yukarı), 8 ile sınırlı
 *  - Açıklama doluluğu (uzunluk eşiklerine göre 0 / 0.5 / 1)
 *  - Satıcı güven puanı (0..5 → 0..20)
 *  - Doğrulanmış satıcı bonusu
 *
 * Saf (pure) fonksiyon: hem yazma yollarında (create/update) hem gece scheduler'ında
 * aynı hesaplamanın kullanılması için tek kaynak.
 */
export interface QualityScoreInput {
  /** Ürüne ait fotoğraf sayısı */
  photoCount: number;
  /** Ürün açıklaması (null/boş olabilir) */
  description?: string | null;
  /** Satıcının ortalama güven puanı (0..5), yoksa null */
  sellerRating?: number | null;
  /** Satıcı doğrulanmış mı */
  isVerifiedSeller?: boolean;
}

export function computeQualityScore(input: QualityScoreInput): number {
  const photoCount = Math.max(0, Math.floor(input.photoCount ?? 0));
  const photoPart = Math.min(photoCount, 8) * 5; // 0..40

  const description = (input.description ?? '').trim();
  let descCompleteness = 0;
  if (description.length >= 200) descCompleteness = 1;
  else if (description.length >= 50) descCompleteness = 0.5;
  const descPart = descCompleteness * 20; // 0..20

  const sellerRating = Math.max(0, Math.min(5, input.sellerRating ?? 0));
  const ratingPart = Math.round(sellerRating * 4); // 0..20

  const verifiedPart = input.isVerifiedSeller ? 5 : 0; // 0..5

  return Math.round(photoPart + descPart + ratingPart + verifiedPart);
}
