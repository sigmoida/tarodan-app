import type { MembershipTierType } from "@prisma/client";

/**
 * The launch values of `MembershipTier.maxSavedSearches` (plan decision
 * C-D1). The reference seed creates new tiers with them; for existing tiers
 * the post-deploy script `maintenance/set-saved-search-limits.ts` applies
 * them once. Afterwards the admin panel owns the values.
 */
export const SAVED_SEARCH_TIER_LIMITS: Readonly<
  Record<MembershipTierType, number>
> = {
  free: 5,
  basic: 10,
  premium: 20,
  business: 50,
};

/** The column default the migration gave every existing tier. */
export const SAVED_SEARCH_LIMIT_COLUMN_DEFAULT = 5;

export interface SavedSearchLimitUpdate {
  type: MembershipTierType;
  from: number;
  to: number;
}

/**
 * The tiers the post-deploy script changes: only those still at the column
 * default whose launch value differs. A value an admin has already changed is
 * left alone, so the script is safe to re-run.
 */
export function planSavedSearchLimitUpdates(
  tiers: ReadonlyArray<{ type: MembershipTierType; maxSavedSearches: number }>,
): SavedSearchLimitUpdate[] {
  return tiers
    .filter(
      (tier) =>
        tier.maxSavedSearches === SAVED_SEARCH_LIMIT_COLUMN_DEFAULT &&
        SAVED_SEARCH_TIER_LIMITS[tier.type] !== tier.maxSavedSearches,
    )
    .map((tier) => ({
      type: tier.type,
      from: tier.maxSavedSearches,
      to: SAVED_SEARCH_TIER_LIMITS[tier.type],
    }));
}
