'use client';

import { ResourceList } from '@/components/list';
import { fetchRefundRequests, REFUND_STATUS_OPTIONS } from '@/lib/refund-request-query';
import { returnShipmentColumns } from './_lib/columns';
import type { ReturnShipmentRow } from './_lib/types';

export function ReturnShipmentsTab() {
  return (
    <ResourceList<ReturnShipmentRow>
      resource="refund-shipments"
      fetcher={fetchRefundRequests}
      getRowId={(r) => r.id}
      initialFilters={{ status: 'all', from: '', to: '' }}
      errorMessage="İade kargoları yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={REFUND_STATUS_OPTIONS} className="sm:w-56" />
        <ResourceList.DateRange fromName="from" toName="to" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={returnShipmentColumns} emptyText="İade kargosu bulunamadı" />
      <ResourceList.Total unit="iade talebi" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
