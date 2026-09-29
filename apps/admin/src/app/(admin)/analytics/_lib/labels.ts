import type { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import { fmtNumber, fmtTry } from "@/lib/format";
import type { MetricFormat } from "./tabConfig";

/** The `t` the calling component already holds — same shape everywhere. */
type Translate = ReturnType<typeof useTranslations<never>>;

/**
 * Schema values the API hands over untranslated.
 *
 * The API returns the enum value (`not_as_described`, `iade`, `v2`) and the
 * SCREEN turns it into words. Sending ready-made Turkish from the server would
 * bypass the catalogue and leave the English admin locale broken.
 *
 * A value with no entry here falls back to itself — a new enum member shows up
 * as its raw code rather than disappearing from the breakdown.
 */
const TRANSLATED_ENUM_VALUES = new Set([
  "rejected",
  "cancelled",
  "v1",
  "v2",
  "buyer",
  "seller",
  "carrier",
  "platform",
  "delivery_delayed",
  "changed_mind",
  "damaged",
  "wrong_item",
  "not_as_described",
  "missing_parts",
  "counterfeit",
  "defective",
  "buyer_damaged",
  "lost_in_transit",
  "other",
  "wrong_product_selected",
  "wrong_card",
  "price_changed_mind",
  "unavailable_at_address",
  "iptal",
  "iade",
  "product",
  "outbound_shipping",
  "return_shipping",
  "buyer_commission",
  "buyer_platform_fee",
  "seller_commission",
  "seller_platform_fee",
  "new",
  "like_new",
  "very_good",
  "good",
  "fair",
]);

const FUNNEL_STEPS = new Set([
  "created",
  "accepted",
  "completed",
  "published",
  "sold",
  "responded",
  "ordered",
]);

/** A breakdown row's display name, by how the API labelled it. */
export function rowLabel(
  t: Translate,
  kind: "db" | "enum" | "raw",
  row: { key: string; label: string },
): string {
  if (kind === "enum") {
    return TRANSLATED_ENUM_VALUES.has(row.key)
      ? t(`admin.analytics.enum.${row.key}` as MessageKey)
      : row.key || t("admin.analytics.uncategorized");
  }
  // A listing with no category or brand still sold something; the row is kept
  // and named here rather than dropped or labelled server-side.
  return row.label || row.key || t("admin.analytics.uncategorized");
}

export function stepLabel(t: Translate, step: string): string {
  return FUNNEL_STEPS.has(step)
    ? t(`admin.analytics.step.${step}` as MessageKey)
    : step;
}

export function seriesLabel(t: Translate, key: string): string {
  return t(`admin.analytics.series.${key}` as MessageKey);
}

/**
 * One formatter per metric unit — the cards, charts and tables all use it.
 *
 * Units go through the catalogue too: "%12,3" is Turkish and "12.3%" is
 * English, so the suffix cannot be hardcoded next to the number.
 */
export function formatMetric(
  t: Translate,
  value: number,
  format: MetricFormat,
): string {
  const number = fmtNumber(value) ?? "0";
  switch (format) {
    case "currency":
      return fmtTry(value) ?? "—";
    case "percent":
      return t("admin.analytics.unit.percent", { value: number });
    case "days":
      return t("admin.analytics.unit.days", { value: number });
    case "hours":
      return t("admin.analytics.unit.hours", { value: number });
    case "count":
    default:
      return number;
  }
}

export const formatShare = (t: Translate, share: number): string =>
  formatMetric(t, share, "percent");
