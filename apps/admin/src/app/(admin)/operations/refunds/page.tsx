'use client';

import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { type Refund, refundColumns } from './_lib/columns';
import { refundRowMenu } from './_lib/rowActions';

export default function RefundsPage() {
  const router = useRouter();
  return (
    <AdminPage>
      <PageHeader title="İade Geçmişi" description="Tamamlanmış iadeler" />

      <ResourceList<Refund>
        resource="refunds"
        fetcher={(p) =>
          adminApi.getRefundHistory({
            search: p.search,
            startDate: p.startDate || undefined,
            endDate: p.endDate || undefined,
            page: p.page,
            limit: p.limit,
          })
        }
        getRowId={(r) => r.id}
        initialFilters={{ startDate: '', endDate: '' }}
        errorMessage="İade geçmişi yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.DateRange />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={refundColumns(refundRowMenu((orderId) => router.push(`/operations/orders/${orderId}`)))}
          emptyText="İade bulunamadı"
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
