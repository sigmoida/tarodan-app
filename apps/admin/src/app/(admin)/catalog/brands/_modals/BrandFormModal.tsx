'use client';

import { FormModal, FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { brandSchema, type BrandFormValues } from '../_lib/schema';
import type { Brand } from '../_lib/types';

export function BrandFormModal({
  open,
  onClose,
  brand,
}: {
  open: boolean;
  onClose: () => void;
  brand?: Brand;
}) {
  const isEdit = Boolean(brand);
  const form = useZodForm(brandSchema, {
    defaultValues: brand
      ? {
          name: brand.name,
          logo: brand.logo ?? '',
          website: brand.website ?? '',
          description: brand.description ?? '',
          country: brand.country ?? '',
          foundedYear: brand.foundedYear != null ? String(brand.foundedYear) : '',
          sortOrder: brand.sortOrder != null ? String(brand.sortOrder) : '0',
          isActive: brand.isActive,
        }
      : {
          name: '',
          logo: '',
          website: '',
          description: '',
          country: '',
          foundedYear: '',
          sortOrder: '0',
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: BrandFormValues) => {
      const payload = {
        name: v.name,
        logo: v.logo || null,
        website: v.website || null,
        description: v.description || null,
        country: v.country || null,
        foundedYear: v.foundedYear ? parseInt(v.foundedYear, 10) : null,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isActive: v.isActive,
      };
      return isEdit ? adminApi.updateBrand(brand!.id, payload) : adminApi.createBrand(payload);
    },
    {
      invalidates: ['brands'],
      successMessage: isEdit ? 'Marka güncellendi' : 'Marka oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Markayı Düzenle' : 'Yeni Marka Ekle'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Ekle'}
    >
      <FormInput name="name" label="Marka Adı" placeholder="Örn: Ferrari" />
      <FormInput name="logo" label="Logo URL" type="url" placeholder="https://example.com/logo.png" />
      <FormInput name="website" label="Web Sitesi" type="url" placeholder="https://www.ferrari.com" />
      <FormTextarea name="description" label="Açıklama" rows={3} placeholder="Marka hakkında kısa açıklama..." />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput name="country" label="Ülke" placeholder="Örn: İtalya" />
        </div>
        <div className="flex-1">
          <FormInput name="foundedYear" label="Kuruluş Yılı" type="number" placeholder="Örn: 1947" />
        </div>
      </div>
      <FormInput name="sortOrder" label="Sıra" type="number" placeholder="0" />
      <FormCheckbox name="isActive" label="Aktif" />
    </FormModal>
  );
}
