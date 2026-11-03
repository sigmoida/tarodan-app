import type {
  SellerTrustLabComparedField,
  SellerTrustLabInputChange,
  SellerTrustLabNotScoredReason,
  SellerTrustLabSeller,
} from "@tarodan/types";
import { fmtDateTime, fmtDecimal, fmtNumber } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";

export interface ChangedInputRow {
  field: SellerTrustLabComparedField;
  label: string;
  stored: string;
  live: string;
}

/** Catalog key of each compared input (next-intl wants literal keys). */
const COMPARED_LABEL = {
  raters: "admin.users.detail.trust.counts.raters",
  eligibleOrders: "admin.users.detail.trust.counts.eligibleOrders",
  failures: "admin.users.detail.trust.counts.failures",
  shipped: "admin.users.detail.trust.counts.shipped",
  late: "admin.users.detail.trust.counts.late",
  transactions: "admin.users.detail.trust.counts.transactions",
  counterparties: "admin.users.detail.trust.counts.counterparties",
  tenureDays: "admin.users.detail.trust.counts.tenureDays",
  smoothed: "admin.users.detail.trust.smoothed",
} as const satisfies Record<SellerTrustLabComparedField, string>;

/** Why an account is not scored (next-intl wants literal keys). */
export const NOT_SCORED_KEY = {
  banned: "admin.system.sellerTrustLab.seller.notScored.banned",
  deleted: "admin.system.sellerTrustLab.seller.notScored.deleted",
  testLane: "admin.system.sellerTrustLab.seller.notScored.testLane",
} as const satisfies Record<SellerTrustLabNotScoredReason, string>;

/** Stored against live for each input that moved since the nightly run. */
export function changedInputRows(
  changes: SellerTrustLabInputChange[],
  t: Translate,
): ChangedInputRow[] {
  const show = (field: SellerTrustLabComparedField, value: number | null) =>
    value === null
      ? "-"
      : ((field === "smoothed" ? fmtDecimal(value, 4) : fmtNumber(value)) ??
        "-");
  return changes.map((change) => ({
    field: change.field,
    label: t(COMPARED_LABEL[change.field]),
    stored: show(change.field, change.stored),
    live: show(change.field, change.live),
  }));
}

export interface WindowRow {
  id: keyof SellerTrustLabSeller["windows"];
  range: string;
}

/** "03.07.2026 10:00 – 03.08.2026 10:00" for each calculation window. */
export function windowRows(
  windows: SellerTrustLabSeller["windows"],
): WindowRow[] {
  return (["rating", "operations", "volume"] as const).map((id) => ({
    id,
    range: `${fmtDateTime(windows[id].since) ?? "-"} – ${fmtDateTime(windows[id].until) ?? "-"}`,
  }));
}
