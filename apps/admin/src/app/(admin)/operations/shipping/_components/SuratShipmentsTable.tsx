"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { DataTable } from "@/components/DataTable";
import { ResourceList, useResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { suratShipmentColumns } from "../_lib/columns";
import type { SuratShipmentRow } from "../_lib/types";
import { suratRowMenu } from "./suratRowActions";

/**
 * The Sürat shipments table + the per-row "sync tracking" action. Aynı barkodu
 * (providerTrackingId) paylaşan sipariş kargoları TEK fiziksel kolidir (satıcı
 * paketi) — sayfa içinde tek satıra indirgenir; kardeş sipariş numaraları satırda
 * gösterilir. (R6: sipariş başına ayrı koli izlenimi verilmez.)
 */
export function SuratShipmentsTable() {
  const router = useRouter();
  const t = useTranslations();
  const { rows, isLoading, sort, setSort } =
    useResourceList<SuratShipmentRow>();

  const parcels = useMemo(() => {
    const byBarcode = new Map<string, SuratShipmentRow>();
    for (const row of rows) {
      const key = row.providerTrackingId ?? `ship:${row.id}`;
      const head = byBarcode.get(key);
      if (!head) {
        byBarcode.set(key, { ...row, siblingOrderNumbers: [] });
      } else if (row.order?.orderNumber) {
        head.siblingOrderNumbers = [
          ...(head.siblingOrderNumbers ?? []),
          row.order.orderNumber,
        ];
      }
    }
    return [...byBarcode.values()];
  }, [rows]);

  const syncTracking = useAdminMutation(
    (id: string) => adminApi.syncShipmentTracking(id),
    {
      invalidates: ["surat-shipments"],
      errorMessage: t("admin.operations.shipping.surat.syncFailed"),
      onSuccess: (res) => {
        const d = (res as any)?.data;
        if (d?.ok)
          toast.success(
            d.message || t("admin.operations.shipping.surat.trackingUpdated"),
          );
        else toast(d?.message || t("admin.operations.shipping.surat.noUpdate"));
      },
    },
  );

  const columns = suratShipmentColumns(
    t,
    suratRowMenu(t, {
      onSync: (id) => syncTracking.mutate(id),
      onViewOrder: (orderId) => router.push(`/operations/orders/${orderId}`),
      syncingId: syncTracking.isPending ? syncTracking.variables : undefined,
    }),
  );

  return (
    <DataTable
      columns={columns}
      data={parcels}
      loading={isLoading}
      emptyText={t("admin.operations.shipping.surat.empty")}
      getRowId={(r) => r.id}
      sort={sort}
      onSort={setSort}
    />
  );
}
