import {
  formatTrustRating,
  type SellerTrustComponentsV1,
} from "@tarodan/types";
import { fmtNumber, fmtPercent } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";

/**
 * Weight of each component in formula v1 (plan "Seller trust score", 3.2).
 * Display only: the API owns the formula and stores sub-scores, so these must
 * follow `SELLER_TRUST_FORMULA_VERSION`. Sum is 1.
 */
export const TRUST_COMPONENT_WEIGHTS_V1 = {
  rating: 0.4,
  reliability: 0.25,
  onTime: 0.15,
  volume: 0.15,
  tenure: 0.05,
} as const;

type ComponentKey = keyof typeof TRUST_COMPONENT_WEIGHTS_V1;

export interface TrustBreakdownRow {
  id: ComponentKey;
  component: string;
  /** "40%" */
  weight: string;
  /** "87%" */
  subScore: string;
  /** "Label: value" parts, joined by the table. */
  detail: string;
}

const pct = (ratio: number) => fmtPercent(ratio * 100) ?? "";
const num = (n: number) => fmtNumber(n) ?? "";

/** The five breakdown rows, in formula order, all from the stored components. */
export function trustBreakdownRows(
  components: SellerTrustComponentsV1,
  t: Translate,
  locale: string,
): TrustBreakdownRow[] {
  const count = (key: string, value: string) =>
    `${t(`admin.users.detail.trust.counts.${key}` as never)}: ${value}`;
  const detail: Record<ComponentKey, string[]> = {
    rating: [
      count("raters", num(components.rating.raters)),
      `${t("admin.users.detail.trust.smoothed")}: ${formatTrustRating(components.rating.smoothed, locale)}`,
    ],
    reliability: [
      count("eligibleOrders", num(components.reliability.eligibleOrders)),
      count("failures", num(components.reliability.failures)),
    ],
    onTime: [
      count("shipped", num(components.onTime.shipped)),
      count("late", num(components.onTime.late)),
    ],
    volume: [
      count("transactions", num(components.volume.transactions)),
      count("counterparties", num(components.volume.counterparties)),
    ],
    tenure: [count("tenureDays", num(components.tenure.days))],
  };
  const keys = Object.keys(TRUST_COMPONENT_WEIGHTS_V1) as ComponentKey[];
  return keys.map((id) => ({
    id,
    component: t(`admin.users.detail.trust.components.${id}` as never),
    weight: pct(TRUST_COMPONENT_WEIGHTS_V1[id]),
    subScore: pct(components[id].subScore),
    detail: detail[id].join(" · "),
  }));
}
