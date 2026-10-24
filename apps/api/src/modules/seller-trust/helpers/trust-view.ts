import type { Prisma } from "@prisma/client";
import {
  SELLER_TRUST_FORMULA_VERSION,
  sellerTrustLevel,
  sellerTrustRatingFromX100,
  type AdminSellerTrustView,
  type SellerTrustComponentsV1,
  type SellerTrustView,
} from "@tarodan/types";

/** The stored columns a public view needs. */
export interface StoredTrustScore {
  scoreX100: number | null;
  formulaVersion: number;
}

/** ...and the ones the admin breakdown adds. */
export interface StoredTrustBreakdown extends StoredTrustScore {
  components: Prisma.JsonValue;
  computedAt: Date;
}

/**
 * The stored row as a profile shows it. No row means the seller has not been
 * scored (no activity in any window, or the first run has not happened): the
 * level is `new`, like a row below the minimum data rule.
 */
export function toSellerTrustView(
  row: StoredTrustScore | null,
): SellerTrustView {
  if (!row) {
    return {
      rating: null,
      level: "new",
      formulaVersion: SELLER_TRUST_FORMULA_VERSION,
    };
  }
  return {
    rating:
      row.scoreX100 === null ? null : sellerTrustRatingFromX100(row.scoreX100),
    level: sellerTrustLevel(row.scoreX100),
    formulaVersion: row.formulaVersion,
  };
}

/**
 * The admin support view: the profile view plus the stored breakdown.
 * `computedAt` null means there is no row ("not computed yet"); a row below
 * the minimum data rule has `rating` null but its breakdown and time.
 */
export function toAdminSellerTrustView(
  row: StoredTrustBreakdown | null,
): AdminSellerTrustView {
  return {
    ...toSellerTrustView(row),
    components: row ? parseTrustComponents(row.components) : null,
    computedAt: row ? row.computedAt.toISOString() : null,
  };
}

/**
 * Narrows the stored JSON to the v1 breakdown. `components.version` is the
 * formula version that wrote the row (`computeSellerTrust`), and the batch is
 * the only writer, so another value means a later formula wrote it: return
 * null rather than show the admin a shape it may not read. A version bump
 * stops compiling at `computeSellerTrust` (`version: 1` in
 * `SellerTrustComponentsV1`); accept the new version here in the same change.
 */
export function parseTrustComponents(
  json: Prisma.JsonValue,
): SellerTrustComponentsV1 | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }
  return json.version === 1
    ? (json as unknown as SellerTrustComponentsV1)
    : null;
}
