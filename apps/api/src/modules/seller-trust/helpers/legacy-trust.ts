import type { SellerTrustLevel, SellerTrustView } from "@tarodan/types";

/**
 * Turkish labels of the legacy `trustLevel` field, by level code. The strings
 * are a wire contract of live mobile 1.0.5, which renders them as they come,
 * so they are not catalog keys and must not change.
 *
 * @deprecated Remove with `trustScore`/`trustLevel` once
 * `min_supported_app_version_*` passes the last version that reads them
 * (tarodan-ops `compat.md`) and the web seller header reads `trust`.
 */
export const LEGACY_TRUST_LEVEL_LABELS = {
  excellent: "Çok Güvenilir",
  trusted: "Güvenilir",
  fair: "Orta",
  developing: "Gelişmekte",
} as const satisfies Record<Exclude<SellerTrustLevel, "new">, string>;

export type LegacyTrustLevelLabel =
  (typeof LEGACY_TRUST_LEVEL_LABELS)[keyof typeof LEGACY_TRUST_LEVEL_LABELS];

/** @deprecated See `LEGACY_TRUST_LEVEL_LABELS`. */
export interface LegacyTrustFields {
  /** 0 to 100: the stored rating times 20. */
  trustScore: number | null;
  trustLevel: LegacyTrustLevelLabel | null;
}

/**
 * The pre-ADR 0014 `trustScore` (0 to 100) and `trustLevel`, derived from the
 * stored rating so live mobile 1.0.5 shows a badge consistent with the new
 * score (decision D7). Both are null when the view is gated (`null`) or the
 * seller has no score: 1.0.5 then shows no badge, and the old `Yeni` label is
 * never sent.
 *
 * The label follows the new level (plan section 7), not the old 0-100
 * thresholds, so 1.0.5 shows the same level word as web and new mobile
 * (4.37 is "87/100 · Güvenilir").
 *
 * `rating × 20` is `score_x100 / 5`, whose fraction is a multiple of 0.2, so
 * the rounding never meets a .5 tie or a float edge.
 *
 * @deprecated See `LEGACY_TRUST_LEVEL_LABELS`.
 */
export function legacyTrustFields(
  trust: SellerTrustView | null,
): LegacyTrustFields {
  if (!trust || trust.rating === null || trust.level === "new") {
    return { trustScore: null, trustLevel: null };
  }
  return {
    trustScore: Math.round(trust.rating * 20),
    trustLevel: LEGACY_TRUST_LEVEL_LABELS[trust.level],
  };
}
