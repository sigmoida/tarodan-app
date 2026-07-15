"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { suratShipmentColumns } from "../_lib/columns";
import { suratRowMenu } from "./suratRowActions";

/** The Sürat shipments table + the per-row "sync tracking" action. */
export function SuratShipmentsTable() {
  const router = useRouter();
  const t = useTranslations();

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
    }),
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.operations.shipping.surat.empty")}
    />
  );
}
