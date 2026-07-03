'use client';

import { FormInput, FormTextarea, FormCheckbox, FormImageUpload, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { manufacturerSchema, type ManufacturerFormValues } from '@/lib/schemas/catalog/manufacturer';
import type { Manufacturer } from '../_lib/types';

export function ManufacturerFormModal({
  open,
  onClose,
  manufacturer,
}: {
  open: boolean;
  onClose: () => void;
  manufacturer?: Manufacturer;
}) {
  const isEdit = Boolean(manufacturer);
  const form = useZodForm(manufacturerSchema, {
    defaultValues: manufacturer
      ? {
          name: manufacturer.name,
          logo: manufacturer.logo ?? '',
          website: manufacturer.website ?? '',
          country: manufacturer.country ?? '',
          foundedYear: manufacturer.foundedYear != null ? String(manufacturer.foundedYear) : '',
          description: manufacturer.description ?? '',
          isActive: manufacturer.isActive,
        }
      : {
          name: '',
          logo: '',
          website: '',
          country: '',
          foundedYear: '',
          description: '',
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: ManufacturerFormValues) => {
      const payload = {
        name: v.name,
        logo: v.logo || null,
        website: v.website || null,
        country: v.country || null,
        foundedYear: v.foundedYear ? parseInt(v.foundedYear, 10) : null,
        description: v.description || null,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateManufacturer(manufacturer!.id, payload)
        : adminApi.createManufacturer(payload);
    },
    {
      invalidates: ['manufacturers'],
      successMessage: isEdit ? 'Üretici güncellendi' : 'Üretici oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Üreticiyi Düzenle' : 'Yeni Üretici Ekle'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Ekle'}
    >
      <FormInput name="name" label="Üretici Adı" placeholder="Örn: Hot Wheels" />
      <FormImageUpload
        name="logo"
        label="Logo"
        upload={(file) => adminApi.uploadMedia(file).then((r) => r.data.url)}
      />
      <FormInput name="website" label="Website" type="url" placeholder="https://www.hotwheels.com" />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput name="country" label="Ülke" placeholder="Örn: ABD" />
        </div>
        <div className="flex-1">
          <FormInput name="foundedYear" label="Kuruluş Yılı" type="number" placeholder="Örn: 1968" />
        </div>
      </div>
      <FormTextarea name="description" label="Açıklama" rows={2} placeholder="Üretici hakkında kısa açıklama" />
      <FormCheckbox name="isActive" label="Aktif" />
    </FormModal>
  );
}
