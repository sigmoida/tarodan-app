import type { SelectOption } from "@tarodan/ui";
import type { DateRangeField, SelectField, TranslateFn } from "./types";

/**
 * Builders for the two field shapes nearly every admin list declares. They exist
 * so ~30 schemas don't each re-pick a label key for "Durum" / "Tarih aralığı" —
 * the label wording is one decision, made here.
 */

export const statusField = (
  t: TranslateFn,
  options: SelectOption[],
  name = "status",
): SelectField => ({
  type: "select",
  name,
  label: t("common.status"),
  options,
});

/** Date-range key names differ per endpoint, hence the explicit arguments. */
export const dateRangeField = (
  t: TranslateFn,
  fromName?: string,
  toName?: string,
): DateRangeField => ({
  type: "dateRange",
  label: t("admin.shared.filterDialog.labels.dateRange"),
  fromName,
  toName,
});
