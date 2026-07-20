import type { AxiosResponse } from "axios";
import { adminApi } from "@/lib/api";

/** Refund-request status filter options (shared by the list + the shipping return tab). */
export const REFUND_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "approved", label: "Onaylandı" },
  { value: "wait_for_delivery", label: "Ürün Teslimi Bekleniyor" },
  { value: "return_shipment_open", label: "İade Kargosu Hazır" },
  { value: "return_in_transit", label: "İade Yolda" },
  { value: "return_delivered", label: "İade Ulaştı (Para Bekleniyor)" },
  { value: "refunded", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal Edildi" },
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
