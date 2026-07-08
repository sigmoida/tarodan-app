'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner } from '@tarodan/ui';
import { PlusIcon, PencilIcon, TrashIcon, TruckIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { StatusToggle } from '@/components/ActiveBadge';
import { ActionIconButton } from '@/components/AdminList';
import { CarModelFormModal } from '../../car-models/_modals/CarModelFormModal';
import type { CarModel } from '../../car-models/_lib/types';
import type { Brand } from '../_lib/types';

/** Expandable car-models panel under a brand row — reuses the shared CarModelFormModal. */
export function BrandModelsPanel({ brand }: { brand: Brand }) {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ model?: CarModel } | null>(null);

  const { data: models = [], isLoading } = useQuery<CarModel[]>({
    queryKey: ['car-models', 'brand', brand.id],
    queryFn: async () => (await adminApi.getCarModels(brand.id)).data?.data ?? [],
  });

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

  return (
    <div className="border-t border-border bg-surface-alt/40 px-4 py-4 sm:px-6">
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner size="sm" /> Modeller yükleniyor...
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <TruckIcon className="h-8 w-8 text-subtle" />
          <p className="text-muted">Bu marka için henüz model eklenmemiş</p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setModal({})}
          >
            Model Ekle
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-body">
              {brand.name} modelleri ({models.length})
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => setModal({})}
            >
              Model Ekle
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-heading">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.slug}</p>
                  <p className="mt-1 text-xs text-muted">
                    {m.yearStart || m.yearEnd
                      ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}`
                      : 'Yıl belirtilmemiş'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusToggle
                    active={m.isActive}
                    onToggle={() => toggle.mutate(m)}
                    busy={toggle.isPending && toggle.variables?.id === m.id}
                  />
                  <div className="flex items-center gap-1">
                    <ActionIconButton icon={PencilIcon} onClick={() => setModal({ model: m })} title="Düzenle" />
                    <ActionIconButton icon={TrashIcon} onClick={() => onDelete(m)} title="Sil" variant="danger" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <CarModelFormModal
          key={modal.model?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          model={modal.model}
          defaultBrandId={brand.id}
          lockBrand
        />
      )}
    </div>
  );
}
