'use client';

import { FormInput, FormTextarea, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import {
  attributeGroupSchema,
  type AttributeGroupFormValues,
} from '../_lib/schema';
import type { AttributeGroup } from '../_lib/types';

export function AttributeGroupFormModal({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group?: AttributeGroup;
}) {
  const isEdit = Boolean(group);
  const form = useZodForm(attributeGroupSchema, {
    defaultValues: group
      ? {
          name: group.name,
          description: group.description ?? '',
          sortOrder: String(group.sortOrder ?? 0),
          isRequired: group.isRequired,
          isActive: group.isActive,
        }
      : { name: '', description: '', sortOrder: '0', isRequired: false, isActive: true },
  });

  const save = useAdminMutation(
    (v: AttributeGroupFormValues) => {
      const payload = {
        name: v.name,
        description: v.description || undefined,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isRequired: v.isRequired,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateAttributeGroup(group!.id, payload)
        : adminApi.createAttributeGroup(payload);
    },
    {
      invalidates: ['attribute-groups'],
      successMessage: isEdit ? 'Grup güncellendi' : 'Grup oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Grubu Düzenle' : 'Yeni Grup'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
    >
      <FormInput name="name" label="Ad" />
      <FormTextarea name="description" label="Açıklama" rows={2} />
      <FormInput name="sortOrder" label="Sıra" type="number" />
      <div className="flex gap-6 pt-1">
        <FormCheckbox name="isRequired" label="Zorunlu" />
        <FormCheckbox name="isActive" label="Aktif" />
      </div>
    </FormModal>
  );
}
