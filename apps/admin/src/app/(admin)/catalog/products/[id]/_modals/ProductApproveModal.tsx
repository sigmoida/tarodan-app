'use client';

import { FormTextarea, useZodForm } from '@tarodan/ui/form';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { FormModal } from '@/components/form/FormModal';
import { productApproveSchema, type ProductApproveValues } from '@/lib/schemas/catalog/product';

export function ProductApproveModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const form = useZodForm(productApproveSchema, { defaultValues: { note: '' } });
  const save = useAdminMutation(
    (v: ProductApproveValues) => adminApi.approveProduct(productId, v.note || undefined),
    { invalidates: ['products'], successMessage: 'Ürün onaylandı', onSuccess: onClose },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Ürünü Onayla"
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel="Onayla"
    >
      <FormTextarea name="note" label="Not (Opsiyonel)" rows={3} placeholder="Onay notu ekleyin..." />
    </FormModal>
  );
}
