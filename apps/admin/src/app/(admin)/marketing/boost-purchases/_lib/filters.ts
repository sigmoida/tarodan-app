import {
  BOOST_SOURCES,
  BOOST_STATUSES,
  type BoostSource,
  type BoostStatus,
} from "@tarodan/types";
import type { SelectOption } from "@tarodan/ui";
import { statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import type { BoostPurchaseListParams } from "@/lib/api/marketing.types";
import { sourceFilterOptions, statusFilterOptions } from "./types";

/** Package options are fetched by the page, so they arrive as an argument. */
export const boostPurchaseFilterFields = (
  t: TranslateFn,
  packageOptions: SelectOption[],
): FilterField[] => [
  {
    type: "select",
    name: "packageId",
    label: t("admin.shared.filterDialog.labels.package"),
    options: packageOptions,
  },
  {
    type: "select",
    name: "source",
    label: t("admin.marketing.boostPurchases.sourceLabel"),
    options: sourceFilterOptions(t),
  },
  statusField(t, statusFilterOptions(t)),
];

const isOneOf = <V extends string>(
  values: readonly V[],
  value: unknown,
): value is V => typeof value === "string" && values.includes(value as V);

/**
 * The list state as the API query: "all" and empty filters are left out, and
 * a status or source the API does not know (an old or edited URL) too.
 */
export function boostPurchaseListParams(
  params: Record<string, unknown>,
): BoostPurchaseListParams {
  const packageId = params.packageId;
  return {
    page: params.page as number | undefined,
    limit: params.limit as number | undefined,
    search: (params.search as string | undefined) || undefined,
    packageId:
      typeof packageId === "string" && packageId && packageId !== "all"
        ? packageId
        : undefined,
    status: isOneOf<BoostStatus>(BOOST_STATUSES, params.status)
      ? params.status
      : undefined,
    source: isOneOf<BoostSource>(BOOST_SOURCES, params.source)
      ? params.source
      : undefined,
  };
}
