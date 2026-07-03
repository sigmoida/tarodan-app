'use client';

import { useQuery } from '@tanstack/react-query';
import { FormInput, FormSelect, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { carModelSchema, type CarModelFormValues } from '@/lib/schemas/catalog/carModel';
import type { Brand, CarModel } from '../_lib/types';

/**
 * Shared create/edit car-model modal — used by both /catalog/car-models and the
 * /catalog/brands expand panel. Brand is locked on edit; `defaultBrandId` +
 * `lockBrand` preselect/lock it when opened from a specific brand.
 */
export function CarModelFormModal({
  open,
  onClose,
  model,
  defaultBrandId,
  lockBrand,
}: {
  open: boolean;
  onClose: () => void;
  model?: CarModel;
  defaultBrandId?: string;
  lockBrand?: boolean;
}) {
  const isEdit = Boolean(model);

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands', 'options'],
    queryFn: async () => (await adminApi.getBrands()).data?.data ?? [],
  });

  const form = useZodForm(carModelSchema, {
    defaultValues: model
      ? {
          brandId: model.brandId,
          name: model.name,
          yearStart: model.yearStart != null ? String(model.yearStart) : '',
          yearEnd: model.yearEnd != null ? String(model.yearEnd) : '',
          isActive: model.isActive,
        }
      : { brandId: defaultBrandId ?? '', name: '', yearStart: '', yearEnd: '', isActive: true },
  });

  const save = useAdminMutation(
    (v: CarModelFormValues) => {
      const payload = {
        name: v.name,
        yearStart: v.yearStart ? Number(v.yearStart) : undefined,
        yearEnd: v.yearEnd ? Number(v.yearEnd) : undefined,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateCarModel(model!.id, payload)
        : adminApi.createCarModel({ ...payload, brandId: v.brandId });
    },
    {
      invalidates: ['car-models', 'brands'],
      successMessage: isEdit ? 'Model güncellendi' : 'Model oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modeli Düzenle' : 'Yeni Model Ekle'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Ekle'}
    >
      <FormSelect
        name="brandId"
        label="Marka"
        placeholder="Seçiniz"
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        disabled={isEdit || lockBrand}
      />
      <FormInput name="name" label="Model Adı" placeholder="Örn: M4, 911 GT3" />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput name="yearStart" label="Başlangıç Yılı" type="number" placeholder="2014" />
        </div>
        <div className="flex-1">
          <FormInput name="yearEnd" label="Bitiş Yılı" type="number" placeholder="Boş = devam ediyor" />
        </div>
      </div>
      <FormCheckbox name="isActive" label="Aktif" />
    </FormModal>
  );
}
