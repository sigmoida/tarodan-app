import type {
  BusinessEntitlementOwner,
  PremiumCheckMembership,
} from "../../membership/helpers/membership.util";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import { computeRelevanceScore } from "./relevance-score";

export const FRESH_PRODUCT_POPULARITY_BASELINE = 10;

export function initialProductRanking(
  membership: PremiumCheckMembership | null | undefined,
  owner: BusinessEntitlementOwner | null | undefined,
  now = new Date(),
) {
  const rankTier = isPremiumEntitled(membership, owner) ? 1 : 0;
  return {
    rankTier,
    popularityScore: FRESH_PRODUCT_POPULARITY_BASELINE,
    popularityUpdatedAt: now,
    relevanceScore: computeRelevanceScore({
      rankTier,
      qualityScore: 0,
      popularityScore: FRESH_PRODUCT_POPULARITY_BASELINE,
    }),
  };
}
