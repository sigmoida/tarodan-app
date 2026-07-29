import type { AxiosResponse } from "axios";
import { adminApi } from "@/lib/api";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Refund-request status filter options (shared by the list + the shipping return tab). */
export const refundStatusOptions = (
  t: T,
): { value: string; label: string }[] => [
  { value: "all", label: t("common.allStatuses") },
  { value: "approved", label: t("common.approved") },
  {
    value: "wait_for_delivery",
    label: t("admin.shared.refunds.status.waitForDelivery"),
  },
  {
    value: "return_shipment_open",
    label: t("admin.shared.refunds.status.returnShipmentOpen"),
  },
  {
    value: "return_in_transit",
    label: t("admin.shared.refunds.status.returnInTransit"),
  },
  {
    value: "return_delivered",
    label: t("admin.shared.refunds.status.returnDelivered"),
  },
  { value: "refunded", label: t("common.completed") },
  { value: "cancelled", label: t("common.cancelled") },
];

/**
 * useAdminResource fetcher for refund requests — maps `search`→`userSearch`,
 * wraps `status` in an array, and normalizes the `{ items, total }` response to
 * the `{ data, meta: { total } }` shape useAdminResource expects.
 */
export function fetchRefundRequests(
  params: Record<string, any>,
): Promise<AxiosResponse<any>> {
  const apiParams: Record<string, any> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search) apiParams.userSearch = params.search;
  if (params.status) apiParams.status = [params.status];
  if (params.from) apiParams.from = params.from;
  if (params.to) apiParams.to = params.to;
  if (params.sortBy) apiParams.sortBy = params.sortBy;
  if (params.sortOrder) apiParams.sortOrder = params.sortOrder;

  return adminApi.getRefundRequests(apiParams).then((res) => {
    const d = res.data?.data ?? res.data;
    if (d && "items" in d) {
      res.data = { data: d.items, meta: { total: d.total } };
    }
    return res;
  });
}
