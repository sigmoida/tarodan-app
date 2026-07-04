'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { fetchRefundRequests, REFUND_STATUS_OPTIONS } from '@/lib/refund-request-query';
import { type RefundRequestRow, refundRequestColumns } from './_lib/columns';

export default function RefundRequestsPage() {
  return (
    <AdminPage>
      <PageHeader
        title="İade Takibi"
        description="Devam eden iadeler — otomatik akış izlenir; yalnız istisnai durumlarda admin müdahalesi gerekir"
      />

      <ResourceList<RefundRequestRow>
        resource="refund-requests"
        fetcher={fetchRefundRequests}
        getRowId={(rr) => rr.id}
        initialFilters={{ status: 'all', from: '', to: '' }}
        errorMessage="İade talepleri yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect name="status" options={REFUND_STATUS_OPTIONS} className="sm:w-56" />
          <ResourceList.DateRange fromName="from" toName="to" />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={refundRequestColumns}
          emptyText="Bu filtrelerle eşleşen iade talebi yok."
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
