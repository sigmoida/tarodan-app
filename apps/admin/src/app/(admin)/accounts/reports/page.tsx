'use client';

import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { type Report, reportStatusOptions, reportTypeOptions } from './_lib/types';
import { reportColumns } from './_lib/columns';

export default function ReportsPage() {
  return (
    <AdminPage>
      <PageHeader
        title="Rapor Talepleri"
        description="Kullanıcıların ürün, kullanıcı, koleksiyon ve mesajlar için gönderdiği şikayetler"
      />
      <ResourceList<Report>
        resource="reports"
        fetcher={(params) => {
          const { limit, ...rest } = params;
          return adminApi.getUserReports({ ...rest, pageSize: limit });
        }}
        getRowId={(r) => r.id}
        syncUrl
        initialFilters={{ status: 'all', type: 'all' }}
        errorMessage="Şikayetler yüklenirken hata oluştu"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Açıklama, hedef veya raporlayan ara..." />
          <ResourceList.FilterSelect
            name="type"
            options={reportTypeOptions}
            className="sm:w-44"
          />
          <ResourceList.FilterSelect
            name="status"
            options={reportStatusOptions}
            className="sm:w-44"
          />
        </ResourceList.Toolbar>
        <ResourceList.Table columns={reportColumns} emptyText="Henüz şikayet yok" />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
