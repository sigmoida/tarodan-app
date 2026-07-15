"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { statusOptions } from "./_shared";
import { SuratTestConsole } from "./_components/SuratTestConsole";
import { SuratShipmentsTable } from "./_components/SuratShipmentsTable";

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
        initialFilters={{ status: "all" }}
        errorMessage={t("admin.operations.shipping.surat.loadError")}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect
            name="status"
            options={statusOptions(t)}
            className="sm:w-56"
          />
        </ResourceList.Toolbar>
        <SuratShipmentsTable />
        <ResourceList.Total unit={t("admin.operations.shipping.surat.unit")} />
        <ResourceList.Pagination />
      </ResourceList>
    </div>
  );
}
