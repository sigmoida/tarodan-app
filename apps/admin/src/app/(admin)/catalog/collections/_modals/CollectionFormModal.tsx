'use client';

import { FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { collectionSchema, type CollectionFormValues } from '../_lib/schema';
import type { Collection } from '../_lib/types';

export function CollectionFormModal({
  open,
  onClose,
  collection,
}: {
  open: boolean;
  onClose: () => void;
  collection?: Collection;
}) {
  const isEdit = Boolean(collection);
  const form = useZodForm(collectionSchema, {
    defaultValues: collection
      ? {
          name: collection.name,
          description: collection.description ?? '',
          coverImageUrl: collection.coverImageUrl ?? '',
          isPublic: collection.isPublic,
          isFeatured: collection.isFeatured,
        }
      : { name: '', description: '', coverImageUrl: '', isPublic: true, isFeatured: false },
  });

  const save = useAdminMutation(
    (v: CollectionFormValues) =>
      isEdit
        ? adminApi.updateCollection(collection!.id, v)
        : adminApi.createCollection({
            name: v.name,
            description: v.description || undefined,
            coverImageUrl: v.coverImageUrl || undefined,
            isPublic: v.isPublic,
            isFeatured: v.isFeatured,
          }),
    {
      invalidates: ['collections'],
      successMessage: isEdit ? 'Koleksiyon güncellendi' : 'Koleksiyon oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Koleksiyon Düzenle' : 'Yeni Koleksiyon'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
    >
      <FormInput name="name" label="Koleksiyon Adı" />
      <FormTextarea name="description" label="Açıklama" rows={3} />
      <FormInput name="coverImageUrl" label="Kapak Görseli URL" type="url" placeholder="https://..." />
      <div className="flex items-center gap-6 pt-1">
        <FormCheckbox name="isPublic" label="Görünür" />
        <FormCheckbox name="isFeatured" label="Öne Çıkan" />
      </div>
    </FormModal>
  );
}
