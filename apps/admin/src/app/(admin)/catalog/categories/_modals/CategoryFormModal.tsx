'use client';

import { FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { categorySchema, type CategoryFormValues } from '@/lib/schemas/catalog/category';
import type { Category } from '../_lib/types';

/** Create/edit category. Mount with `key={category?.id ?? 'new'}` so defaults seed fresh. */
export function CategoryFormModal({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category?: Category;
}) {
  const isEdit = Boolean(category);
  const form = useZodForm(categorySchema, {
    defaultValues: category
      ? { name: category.name, description: category.description ?? '', isActive: category.isActive }
      : { name: '', description: '', isActive: true },
  });

  const save = useAdminMutation(
    (v: CategoryFormValues) =>
      isEdit
        ? adminApi.updateCategory(category!.id, { ...v, parentId: '' })
        : adminApi.createCategory({ ...v, parentId: '' }),
    {
      invalidates: ['categories'],
      successMessage: isEdit ? 'Kategori güncellendi' : 'Kategori oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kategori Düzenle' : 'Yeni Kategori'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
    >
      <FormInput name="name" label="Kategori Adı" />
      <FormTextarea name="description" label="Açıklama" rows={3} />
      <FormCheckbox name="isActive" label="Aktif" />
    </FormModal>
  );
}
