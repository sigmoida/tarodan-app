import type { ReviewStatus } from "./types";

/**
 * Moderasyon geçişleri — satır menüsü ve detay çekmecesi AYNI listeyi okur.
 * Sıra ekrandaki sırayla: onayla, geri al (bekleyene), reddet.
 *  - onayla: onaylı olmayan her yorum
 *  - geri al: yalnız reddedilmiş yorum
 *  - reddet: reddedilmemiş her yorum
 * Durumu olmayan satır (eski satıcı yorumu) onaylı sayılır.
 */
export function reviewTransitions(
  status: ReviewStatus | undefined,
): ReviewStatus[] {
  const s = status ?? "approved";
  const targets: ReviewStatus[] = [];
  if (s !== "approved") targets.push("approved");
  if (s === "rejected") targets.push("pending");
  if (s !== "rejected") targets.push("rejected");
  return targets;
}

/** Geçiş hedefi → buton / menü etiketi (i18n anahtarı). */
export const REVIEW_TRANSITION_LABEL_KEY = {
  approved: "common.confirm",
  pending: "admin.accounts.reviews.revert",
  rejected: "admin.accounts.reviews.reject",
} as const satisfies Record<ReviewStatus, string>;
