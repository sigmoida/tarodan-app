/** @format */

"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { clientListFetcher } from "@/lib/query/client-list";
import {
  type Ad,
  positionFilterOptions,
  deviceFilterOptions,
} from "./_lib/types";
import { AdsStats } from "./_components/AdsStats";
import { AdsTable } from "./_components/AdsTable";
import { AdFormModal } from "./_modals/AdFormModal";

export default function AdsPage() {
  const [modal, setModal] = useState<{ ad?: Ad } | null>(null);

  return (
    <AdminPage>
      <PageHeader
        title="Reklam Yönetimi"
        description="IAB standartlarına uygun reklam yönetimi"
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          Yeni Reklam
        </Button>
      </PageHeader>

      <AdsStats />

      <ResourceList<Ad>
        resource="ads"
        // Full-load: getAds returns every ad (bounded set) and we sort/search/
        // paginate client-side. Move to the server contract if ads grow (#383).
        fetcher={clientListFetcher<Ad>(
          () => adminApi.getAds(),
          (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
          {
            // No searchFields → full-content search across all displayed columns (#378).
            filter: (a, p) =>
              (!p.position ||
                p.position === "all" ||
                a.position === p.position) &&
              (!p.device || p.device === "all" || a.deviceType === p.device),
          },
        )}
        getRowId={(a) => a.id}
        syncUrl
        initialFilters={{ position: "all", device: "all" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect
            name="position"
            options={positionFilterOptions}
            className="sm:w-44"
          />
          <ResourceList.FilterSelect
            name="device"
            options={deviceFilterOptions}
            className="sm:w-40"
          />
        </ResourceList.Toolbar>
        <AdsTable onEdit={(ad) => setModal({ ad })} />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <AdFormModal
          key={modal.ad?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          ad={modal.ad}
        />
      )}
    </AdminPage>
  );
}
