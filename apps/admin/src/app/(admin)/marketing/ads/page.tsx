'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/clientList';
import { type Ad, positionFilterOptions, deviceFilterOptions } from './_lib/types';
import { AdsStats } from './_components/AdsStats';
import { AdsTable } from './_components/AdsTable';
import { AdFormModal } from './_modals/AdFormModal';

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
        fetcher={clientListFetcher<Ad>(
          () => adminApi.getAds(),
          (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
          {
            searchFields: (a) => [a.title, a.content ?? '', a.altText ?? ''],
            filter: (a, p) =>
              (!p.position || p.position === 'all' || a.position === p.position) &&
              (!p.device || p.device === 'all' || a.deviceType === p.device),
          },
        )}
        getRowId={(a) => a.id}
        syncUrl
        initialFilters={{ position: 'all', device: 'all' }}
        errorMessage="Reklamlar yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Reklam ara (başlık, içerik)..." />
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
          key={modal.ad?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          ad={modal.ad}
        />
      )}
    </AdminPage>
  );
}
