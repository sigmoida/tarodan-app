'use client';

import { FormInput, FormCheckbox, useZodForm } from '@tarodan/ui/form';
import { colors } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { attributeSchema, type AttributeFormValues } from '../_lib/schema';
import type { Attribute } from '../_lib/types';

const DEFAULT_COLOR = colors.primary[500];

export function AttributeFormModal({
  open,
  onClose,
  attribute,
  groupId,
  showColor,
}: {
  open: boolean;
  onClose: () => void;
  attribute?: Attribute;
  groupId: string;
  showColor?: boolean;
}) {
  const isEdit = Boolean(attribute);
  const form = useZodForm(attributeSchema, {
    defaultValues: attribute
      ? {
          value: attribute.value,
          displayValue: attribute.displayValue ?? '',
          color: attribute.color ?? (showColor ? DEFAULT_COLOR : ''),
          sortOrder: String(attribute.sortOrder ?? 0),
          isActive: attribute.isActive,
        }
      : {
          value: '',
          displayValue: '',
          color: showColor ? DEFAULT_COLOR : '',
          sortOrder: '0',
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: AttributeFormValues) => {
      const payload = {
        value: v.value,
        displayValue: v.displayValue || undefined,
        color: showColor ? v.color || undefined : undefined,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateAttribute(attribute!.id, payload)
        : adminApi.createAttribute({ ...payload, groupId });
    },
    {
      invalidates: ['attributes'],
      successMessage: isEdit ? 'Değer güncellendi' : 'Değer oluşturuldu',
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Değeri Düzenle' : 'Yeni Değer'}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}
    >
      <FormInput name="value" label="Değer" />
      <FormInput name="displayValue" label="Görüntülenen Değer" />
      <div className="flex gap-4">
        {showColor && (
          <div>
            <FormInput name="color" label="Renk" type="color" className="h-10 w-14 p-1" />
          </div>
        )}
        <div className="flex-1">
          <FormInput name="sortOrder" label="Sıra" type="number" />
        </div>
      </div>
      <FormCheckbox name="isActive" label="Aktif" />
    </FormModal>
  );
}
