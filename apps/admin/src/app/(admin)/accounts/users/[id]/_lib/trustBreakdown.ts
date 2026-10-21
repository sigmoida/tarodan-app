import {
  SELLER_TRUST_COMPONENTS_V1,
  SELLER_TRUST_WEIGHTS_V1,
  type SellerTrustComponentKey,
  type SellerTrustComponentsV1,
} from "@tarodan/types";
import { fmtDecimal, fmtNumber, fmtPercent } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";

export interface TrustBreakdownRow {
  id: SellerTrustComponentKey;
  component: string;
  /** "%40" */
  weight: string;
  /** "%87" */
  subScore: string;
  /** First "Label: value" count, and the second one when the component has it. */
  detail: { value: string; secondary?: string };
}

/** Catalog key of each component's label (next-intl wants literal keys). */
const COMPONENT_LABEL = {
  rating: "admin.users.detail.trust.components.rating",
  reliability: "admin.users.detail.trust.components.reliability",
  onTime: "admin.users.detail.trust.components.onTime",
  volume: "admin.users.detail.trust.components.volume",
  tenure: "admin.users.detail.trust.components.tenure",
} as const satisfies Record<SellerTrustComponentKey, string>;

/** Catalog key of each count shown in the detail cell. */
const COUNT_LABEL = {
  raters: "admin.users.detail.trust.counts.raters",
  eligibleOrders: "admin.users.detail.trust.counts.eligibleOrders",
  failures: "admin.users.detail.trust.counts.failures",
  shipped: "admin.users.detail.trust.counts.shipped",
  late: "admin.users.detail.trust.counts.late",
  transactions: "admin.users.detail.trust.counts.transactions",
  counterparties: "admin.users.detail.trust.counts.counterparties",
  tenureDays: "admin.users.detail.trust.counts.tenureDays",
} as const;
type CountKey = keyof typeof COUNT_LABEL;

const pct = (ratio: number) => fmtPercent(ratio * 100) ?? "";
const num = (n: number) => fmtNumber(n) ?? "";

/**
 * The five breakdown rows, in formula order. Sub-scores and counts come from
 * the stored components; the weights from the shared formula constants.
 */
export function trustBreakdownRows(
  components: SellerTrustComponentsV1,
  t: Translate,
): TrustBreakdownRow[] {
  const count = (key: CountKey, value: number) =>
    `${t(COUNT_LABEL[key])}: ${num(value)}`;
  const { rating, reliability, onTime, volume, tenure } = components;
  const detail: Record<SellerTrustComponentKey, [string, string?]> = {
    rating: [
      count("raters", rating.raters),
      `${t("admin.users.detail.trust.smoothed")}: ${fmtDecimal(rating.smoothed) ?? ""}`,
    ],
    reliability: [
      count("eligibleOrders", reliability.eligibleOrders),
      count("failures", reliability.failures),
    ],
    onTime: [count("shipped", onTime.shipped), count("late", onTime.late)],
    volume: [
      count("transactions", volume.transactions),
      count("counterparties", volume.counterparties),
    ],
    tenure: [count("tenureDays", tenure.days)],
  };
  return SELLER_TRUST_COMPONENTS_V1.map((id) => ({
    id,
    component: t(COMPONENT_LABEL[id]),
    weight: pct(SELLER_TRUST_WEIGHTS_V1[id]),
    subScore: pct(components[id].subScore),
    detail: { value: detail[id][0], secondary: detail[id][1] },
  }));
}
