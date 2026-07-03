'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/clientList';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import type { Manufacturer } from './_lib/types';
import { manufacturerColumns } from './_lib/columns';
import { ManufacturerFormModal } from './_modals/ManufacturerFormModal';

export default function ManufacturersPage() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ manufacturer?: Manufacturer } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteManufacturer(id), {
    invalidates: ['manufacturers'],
    successMessage: 'Üretici silindi',
  });
  const toggle = useAdminMutation(
    (m: Manufacturer) => adminApi.updateManufacturer(m.id, { isActive: !m.isActive }),
    { invalidates: ['manufacturers'] },
  );

  const onDelete = async (m: Manufacturer) => {
    if (
      await confirm({
        title: 'Üreticiyi Sil',
        description: 'Bu üreticiyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        destructive: true,
      })
    )
      del.mutate(m.id);
  };

  const columns = manufacturerColumns({
    onEdit: (m) => setModal({ manufacturer: m }),
    onDelete,
    onToggle: (m) => toggle.mutate(m),
    busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
  });

  return (
    <AdminPage>
      <PageHeader
        title="Üretici Yönetimi"
        description="Diecast model üreticilerini (Hot Wheels, Matchbox vb.) buradan yönetebilirsiniz"
      >
        <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
          Yeni Üretici Ekle
        </Button>
      </PageHeader>

      <ResourceList<Manufacturer>
        resource="manufacturers"
        fetcher={clientListFetcher<Manufacturer>(
          () => adminApi.getManufacturers(),
          (raw) => raw.data ?? [],
          { searchFields: ['name', 'slug', 'country', 'website', 'description'] },
        )}
        getRowId={(m) => m.id}
        syncUrl
        errorMessage="Üreticiler yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Üretici ara..." />
        </ResourceList.Toolbar>
        <ResourceList.Table columns={columns} emptyText="Henüz üretici eklenmemiş" />
        <ResourceList.Total unit="üretici" />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <ManufacturerFormModal
          key={modal.manufacturer?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          manufacturer={modal.manufacturer}
        />
      )}
    </AdminPage>
  );
}
