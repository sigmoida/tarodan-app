'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { statusOptions } from './_shared';
import { orderShipmentColumns } from './_lib/columns';
import type { OrderShipmentRow } from './_lib/types';

export function OrderShipmentsTab() {
  return (
    <ResourceList<OrderShipmentRow>
      resource="shipping-shipments"
      fetcher={(p) => adminApi.getShipments(p)}
      getRowId={(r) => r.id}
      initialFilters={{ status: 'all' }}
      errorMessage="Gönderiler yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-56" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={orderShipmentColumns} emptyText="Gönderi bulunamadı" />
      <ResourceList.Total unit="gönderi" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
