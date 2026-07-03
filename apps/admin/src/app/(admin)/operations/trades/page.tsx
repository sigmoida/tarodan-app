'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { statusOptions } from './_lib/trades';
import { TradesSummary } from './_components/TradesSummary';
import { TradesHeaderActions } from './_components/TradesHeaderActions';
import { TradesTable } from './_components/TradesTable';

export default function TradesPage() {
  return (
    <ResourceList
      resource="trades"
      fetcher={(p) => adminApi.getTrades(p)}
      getRowId={(t: any) => t.id}
      syncUrl
      initialFilters={{ status: 'all', userId: '' }}
      errorMessage="Takaslar yüklenemedi"
    >
      <ResourceList.Header
        title="Takaslar"
        description={<TradesSummary />}
        actions={<TradesHeaderActions />}
      />
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-48" />
      </ResourceList.Toolbar>
      <TradesTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
