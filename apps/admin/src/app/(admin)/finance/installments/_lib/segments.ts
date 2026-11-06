import { membershipTierConfig } from "@tarodan/shared";
import {
  INSTALLMENT_SEGMENTS,
  type InstallmentBuyerSegment,
  type InstallmentSegment,
} from "@tarodan/types";
import type { SelectOption } from "@tarodan/ui";
import type { Translate } from "@/lib/statusLabels";

/** Every segment a buyer can have (all but the `all` wildcard), in list order. */
export const INSTALLMENT_BUYER_SEGMENTS = INSTALLMENT_SEGMENTS.filter(
  (segment): segment is InstallmentBuyerSegment => segment !== "all",
);

/**
 * The label of an installment segment. The four tiers reuse the shared
 * membership tier labels; `all` and `guest` have their own.
 */
export function installmentSegmentLabel(
  t: Translate,
  segment: InstallmentSegment,
): string {
  if (segment === "all") return t("admin.finance.installments.segments.all");
  if (segment === "guest") {
    return t("admin.finance.installments.segments.guest");
  }
  return t(membershipTierConfig[segment].labelKey);
}

export const installmentSegmentOptions = (
  t: Translate,
  segments: readonly InstallmentSegment[] = INSTALLMENT_SEGMENTS,
): SelectOption[] =>
  segments.map((segment) => ({
    value: segment,
    label: installmentSegmentLabel(t, segment),
  }));

export function isBuyerSegment(
  value: string,
): value is InstallmentBuyerSegment {
  return (INSTALLMENT_BUYER_SEGMENTS as readonly string[]).includes(value);
}
