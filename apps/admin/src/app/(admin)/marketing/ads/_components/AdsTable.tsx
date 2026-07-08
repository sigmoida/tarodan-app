'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { adColumns } from '../_lib/columns';
import { adRowMenu } from '../_lib/rowActions';
import { type Ad } from '../_lib/types';

export function AdsTable({ onEdit }: { onEdit: (ad: Ad) => void }) {
  const confirm = useConfirm();

  const toggle = useAdminMutation((ad: Ad) => adminApi.updateAd(ad.id, { isActive: !ad.isActive }), {
    invalidates: ['ads'],
  });
  const del = useAdminMutation((id: string) => adminApi.deleteAd(id), {
    invalidates: ['ads'],
    successMessage: 'Reklam silindi',
  });

  const onDelete = async (ad: Ad) => {
    if (
      await confirm({
        description: 'Bu reklamı silmek istediğinize emin misiniz?',
        destructive: true,
      })
    )
      del.mutate(ad.id);
  };

  const columns = adColumns({
    onToggle: (ad) => toggle.mutate(ad),
    togglingId: toggle.isPending ? toggle.variables?.id : undefined,
    rowMenu: adRowMenu({ onEdit, onDelete }),
  });

  return <ResourceList.Table columns={columns} emptyText="Henüz reklam yok. Yeni reklam ekleyin." />;
}
