'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { ResourceList } from '@/components/list';
import { paginateClient } from '@/lib/query/clientList';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import type { CarModel } from './_lib/types';
import { carModelColumns } from './_lib/columns';
import { CarModelFilters } from './_components/CarModelFilters';
import { CarModelFormModal } from './_modals/CarModelFormModal';

export default function CarModelsPage() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ model?: CarModel } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteCarModel(id), {
    invalidates: ['car-models', 'brands'],
    successMessage: 'Model silindi',
  });
  const toggle = useAdminMutation(
    (m: CarModel) => adminApi.updateCarModel(m.id, { isActive: !m.isActive }),
    { invalidates: ['car-models', 'brands'] },
  );

  const onDelete = async (m: CarModel) => {
    if (
      await confirm({
        title: 'Modeli Sil',
        description: 'Bu modeli silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        destructive: true,
      })
    )
      del.mutate(m.id);
  };

  const columns = carModelColumns({
    onEdit: (m) => setModal({ model: m }),
    onDelete,
    onToggle: (m) => toggle.mutate(m),
    busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
  });

  return (
    <AdminPage>
      <PageHeader
        title="Model Yönetimi"
        description="Marka bazlı araç modellerini (örn. BMW M4, Porsche 911) buradan yönetebilirsiniz"
      >
        <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
          Yeni Model Ekle
        </Button>
      </PageHeader>

      <ResourceList<CarModel>
        resource="car-models"
        fetcher={async (params) => {
          const res = await adminApi.getCarModels(params.brandId || undefined);
          const items: CarModel[] = res.data?.data ?? res.data ?? [];
          return {
            ...res,
            data: paginateClient(items, params, {
              searchFields: (m) => [m.name, m.slug, m.brand?.name],
            }),
          };
        }}
        getRowId={(m) => m.id}
        syncUrl
        initialFilters={{ brandId: '' }}
        errorMessage="Modeller yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Model ara (ad, marka)..." />
          <CarModelFilters />
        </ResourceList.Toolbar>
        <ResourceList.Table columns={columns} emptyText="Bu marka için henüz model eklenmemiş" />
        <ResourceList.Total unit="model" />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <CarModelFormModal
          key={modal.model?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          model={modal.model}
        />
      )}
    </AdminPage>
  );
}
