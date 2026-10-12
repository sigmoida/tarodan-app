import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Escrow helpers. The "why is this hold waiting / can it be released" decision
 * is the SERVER's (`releasable` + `releaseBlockedReason` on the hold rows, see
 * finance/payouts/_lib/holdReason.ts) — it is NOT derived here.
 */

/** Turkish badge label for Order.cancellationType (iptal | iade). */
export function cancellationTypeLabel(
  type: string | null | undefined,
  t: T,
): { label: string; detail: string } | null {
  if (!type) return null;
  if (type === "iptal") {
    return {
      label: t("admin.shared.escrow.cancellation.beforeShipping.label"),
      detail: t("admin.shared.escrow.cancellation.beforeShipping.detail"),
    };
  }
  if (type === "iade") {
    return {
      label: t("admin.shared.escrow.cancellation.afterShipping.label"),
      detail: t("admin.shared.escrow.cancellation.afterShipping.detail"),
    };
  }
  return { label: type, detail: "" };
}
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;
