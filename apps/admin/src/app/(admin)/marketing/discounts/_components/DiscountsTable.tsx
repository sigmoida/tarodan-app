'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { discountColumns } from '../_lib/columns';
import { discountRowMenu } from '../_lib/rowActions';
import { type Discount } from '../_lib/types';

/** İndirim tablosu — aktif/pasif toggle + silme burada mutation olarak yaşar. */
export function DiscountsTable({ onEdit }: { onEdit: (d: Discount) => void }) {
  const confirm = useConfirm();

  const toggle = useAdminMutation(
    (d: Discount) => adminApi.patch(`/admin/discounts/${d.id}`, { isActive: !d.isActive }),
    {
      invalidates: ['discounts'],
      successMessage: 'Durum güncellendi',
      errorMessage: 'Durum güncellenirken hata oluştu',
    },
  );

  const del = useAdminMutation((id: string) => adminApi.delete(`/admin/discounts/${id}`), {
    invalidates: ['discounts'],
    successMessage: 'İndirim silindi',
    errorMessage: 'İndirim silinirken hata oluştu',
  });

  const onDelete = async (d: Discount) => {
    const ok = await confirm({
      title: 'İndirimi Sil',
      description: 'Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (ok) del.mutate(d.id);
  };

  const columns = discountColumns(
    discountRowMenu({ onToggle: (d) => toggle.mutate(d), onEdit, onDelete }),
  );

  return <ResourceList.Table columns={columns} emptyText="Henüz indirim tanımlanmamış" />;
}
