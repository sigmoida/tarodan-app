'use client';

import { FormTextarea, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { productRejectSchema, type ProductRejectValues } from '@/lib/schemas/catalog/product';

export function ProductRejectModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const form = useZodForm(productRejectSchema, { defaultValues: { reason: '' } });
  const save = useAdminMutation((v: ProductRejectValues) => adminApi.rejectProduct(productId, v.reason), {
    invalidates: ['products'],
    successMessage: 'Ürün reddedildi',
    onSuccess: onClose,
  });

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Ürünü Reddet"
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel="Reddet"
    >
      <FormTextarea name="reason" label="Red Nedeni" rows={4} placeholder="Red nedenini açıklayın..." />
    </FormModal>
  );
}
