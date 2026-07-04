'use client';

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { suratShipmentColumns } from '../_lib/columns';
import { suratRowMenu } from './suratRowActions';

/** The Sürat shipments table + the per-row "sync tracking" action. */
export function SuratShipmentsTable() {
  const router = useRouter();

  const syncTracking = useAdminMutation((id: string) => adminApi.syncShipmentTracking(id), {
    invalidates: ['surat-shipments'],
    errorMessage: 'Takip senkronu başarısız oldu',
    onSuccess: (res) => {
      const d = (res as any)?.data;
      if (d?.ok) toast.success(d.message || 'Takip güncellendi');
      else toast(d?.message || "Sürat'tan güncelleme alınamadı");
    },
  });

  const columns = suratShipmentColumns(
    suratRowMenu({
      onSync: (id) => syncTracking.mutate(id),
      onViewOrder: (orderId) => router.push(`/operations/orders/${orderId}`),
    }),
  );

  return <ResourceList.Table columns={columns} emptyText="Sürat kargosu bulunamadı" />;
}
