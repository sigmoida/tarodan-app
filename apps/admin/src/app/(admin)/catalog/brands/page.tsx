'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/client-list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import type { Brand } from './_lib/types';
import { brandColumns } from './_lib/columns';
import { BrandModelsPanel } from './_components/BrandModelsPanel';
import { BrandFormModal } from './_modals/BrandFormModal';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tüm Markalar' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
];

export default function BrandsPage() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ brand?: Brand } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteBrand(id), {
    invalidates: ['brands'],
    successMessage: 'Marka silindi',
  });
  const toggle = useAdminMutation(
    (b: Brand) => adminApi.updateBrand(b.id, { isActive: !b.isActive }),
    { invalidates: ['brands'] },
  );

  const onDelete = async (b: Brand) => {
    if (
      await confirm({
        title: 'Markayı Sil',
        description: 'Bu markayı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        destructive: true,
      })
    )
      del.mutate(b.id);
  };

  const columns = brandColumns({
    onEdit: (b) => setModal({ brand: b }),
    onDelete,
    onToggle: (b) => toggle.mutate(b),
    onToggleExpand: (id) => setExpandedId((prev) => (prev === id ? null : id)),
    expandedId,
    busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
  });

  return (
    <AdminPage>
      <PageHeader
        title="Marka Yönetimi"
        description="Uygulamada gösterilecek markaları buradan yönetebilirsiniz"
      >
        <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
          Yeni Marka Ekle
        </Button>
      </PageHeader>

      <ResourceList<Brand>
        resource="brands"
        fetcher={clientListFetcher<Brand>(
          () => adminApi.getBrands(),
          (raw) => raw.data ?? [],
          {
            searchFields: ['name', 'slug', 'description'],
            filter: (b, params) =>
              params.status === 'active' ? b.isActive : params.status === 'inactive' ? !b.isActive : true,
          },
        )}
        getRowId={(b) => b.id}
        syncUrl
        initialFilters={{ status: 'all' }}
        errorMessage="Markalar yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Marka ara..." />
          <ResourceList.FilterSelect name="status" options={STATUS_OPTIONS} className="sm:w-40" />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={columns}
          emptyText="Henüz marka eklenmemiş"
          expandedId={expandedId}
          renderExpanded={(b) => <BrandModelsPanel brand={b} />}
        />
        <ResourceList.Total unit="marka" />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <BrandFormModal
          key={modal.brand?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          brand={modal.brand}
        />
      )}
    </AdminPage>
  );
}
