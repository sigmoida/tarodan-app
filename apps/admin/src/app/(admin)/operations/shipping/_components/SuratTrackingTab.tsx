"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { suratFilterFields } from "../_lib/filters";
import { SuratTestConsole } from "./SuratTestConsole";
import { SuratShipmentsTable } from "./SuratShipmentsTable";

export function SuratTrackingTab() {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <SuratTestConsole />

      <p className="text-sm text-muted">
        {t("admin.operations.shipping.surat.liveInfoPrefix")}
        <span className="font-medium text-body">
          {t("admin.operations.shipping.surat.refreshTracking")}
        </span>
        {t("admin.operations.shipping.surat.liveInfoSuffix")}
      </p>

      <ResourceList
        resource="surat-shipments"
        fetcher={(p) => adminApi.getShipments({ ...p, carrierId: "surat" })}
        getRowId={(r: any) => r.id}
        filters={suratFilterFields(t)}
        syncUrl
      >
        <ResourceList.Toolbar />
        <SuratShipmentsTable />
        <ResourceList.Pagination />
      </ResourceList>
    </div>
  );
}
