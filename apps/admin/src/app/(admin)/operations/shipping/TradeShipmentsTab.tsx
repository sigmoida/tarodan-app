'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { statusOptions, legOptions } from './_shared';
import { tradeShipmentColumns } from './_lib/columns';
import type { TradeShipmentRow } from './_lib/types';

export function TradeShipmentsTab() {
  return (
    <ResourceList<TradeShipmentRow>
      resource="trade-shipments"
      fetcher={({ search: q, ...params }) =>
        adminApi.getTradeShipments({ ...params, tradeNumber: q || undefined })
      }
      getRowId={(r) => r.id}
      initialFilters={{ status: 'all', leg: 'all' }}
      errorMessage="Takas kargoları yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-56" />
        <ResourceList.FilterSelect name="leg" options={legOptions} className="sm:w-44" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={tradeShipmentColumns} emptyText="Takas kargosu bulunamadı" />
      <ResourceList.Total unit="kargo" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
