"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { statusOptions } from "./_shared";
import { SuratTestConsole } from "./_components/SuratTestConsole";
import { SuratShipmentsTable } from "./_components/SuratShipmentsTable";

export function SuratTrackingTab() {
  return (
    <div className="space-y-4">
      <SuratTestConsole />

      <p className="text-sm text-muted">
        Sürat Kargo gönderilerinin canlı durumu. Durumlar arka planda her 30 dakikada bir otomatik
        senkronlanır; anlık güncel durum için satırdaki{" "}
        <span className="font-medium text-body">Takibi Yenile</span> düğmesini kullanın.
      </p>

      <ResourceList
        resource="surat-shipments"
        fetcher={(p) => adminApi.getShipments({ ...p, carrierId: "surat" })}
        getRowId={(r: any) => r.id}
        initialFilters={{ status: "all" }}
        errorMessage="Sürat kargoları yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-56" />
        </ResourceList.Toolbar>
        <SuratShipmentsTable />
        <ResourceList.Total unit="Sürat gönderisi" />
        <ResourceList.Pagination />
      </ResourceList>
    </div>
  );
}
