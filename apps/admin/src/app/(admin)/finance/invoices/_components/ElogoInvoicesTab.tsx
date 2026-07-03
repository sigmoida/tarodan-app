'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { elogoColumns } from '../_lib/columns';
import {
  type Invoice,
  mapInvoices,
  typeFilterOptions,
  statusFilterOptions,
  documentTypeFilterOptions,
} from '../_lib/types';

export function ElogoInvoicesTab() {
  return (
    <ResourceList<Invoice>
      resource="invoices"
      fetcher={(p) =>
        adminApi.getInvoices(p).then((res) => {
          const root = res.data ?? {};
          const raw = root.data ?? root.items ?? [];
          const total = root.meta?.total ?? root.total ?? raw.length;
          return { ...res, data: { data: mapInvoices(raw), meta: { total } } };
        })
      }
      getRowId={(i) => i.id}
      syncUrl
      initialFilters={{
        type: 'all',
        status: 'all',
        documentType: 'all',
        startDate: '',
        endDate: '',
      }}
      errorMessage="Faturalar yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Fatura no, alıcı, VKN veya ETTN ara..." />
        <ResourceList.FilterSelect name="type" options={typeFilterOptions} className="sm:w-44" />
        <ResourceList.FilterSelect name="status" options={statusFilterOptions} className="sm:w-40" />
        <ResourceList.FilterSelect
          name="documentType"
          options={documentTypeFilterOptions}
          className="sm:w-36"
        />
        <ResourceList.DateRange />
      </ResourceList.Toolbar>
      <ResourceList.Total unit="belge" />
      <ResourceList.Table columns={elogoColumns} emptyText="Fatura bulunamadı" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
