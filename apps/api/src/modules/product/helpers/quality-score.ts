/**
 * Listing quality score. Orders boosted and premium listings within their own
 * rank tier. Components:
 *  - photo count (more photos rank higher), capped at 8: 0..40
 *  - description completeness (length thresholds give 0 / 0.5 / 1): 0..20
 *  - the seller's stored trust rating (0..5, ADR 0014): 0..20
 *
 * There is no verified-seller bonus any more (decision D8): `is_verified` is
 * set only by seeds, so it rewarded the seeded accounts and no behaviour.
 *
 * Pure: the write paths (create/update) and the nightly scheduler call the
 * same function.
 */
export interface QualityScoreInput {
  /** Number of images on the listing. */
  photoCount: number;
  /** Listing description (may be null or empty). */
  description?: string | null;
  /**
   * The seller's stored trust rating, 0.00 to 5.00 (`SellerTrustView.rating`).
   * Null for a seller without a score (`new`), which earns no rating points.
   */
  sellerTrustRating?: number | null;
}

export function computeQualityScore(input: QualityScoreInput): number {
  const photoCount = Math.max(0, Math.floor(input.photoCount ?? 0));
  const photoPart = Math.min(photoCount, 8) * 5; // 0..40

  const description = (input.description ?? "").trim();
  let descCompleteness = 0;
  if (description.length >= 200) descCompleteness = 1;
  else if (description.length >= 50) descCompleteness = 0.5;
  const descPart = descCompleteness * 20; // 0..20

  const trustRating = Math.max(0, Math.min(5, input.sellerTrustRating ?? 0));
  const ratingPart = Math.round(trustRating * 4); // 0..20

  return Math.round(photoPart + descPart + ratingPart);
}
