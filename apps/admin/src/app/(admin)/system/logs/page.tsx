'use client';

import { useCallback, useState } from 'react';
import { Button, cn } from '@tarodan/ui';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { FilterToolbar } from '@/components/AdminList';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { MetricCard } from '@/components/MetricCard';
import { useAdminResource } from '@/hooks/useAdminResource';
import {
  type LogTab,
  type AnyLog,
  type ErrorLog,
  type AuditLog,
  LOG_TABS,
  SEARCH_PLACEHOLDERS,
  EMPTY_TEXT,
} from './_lib/types';
import { buildErrorColumns, buildSecurityColumns, buildEmailColumns, buildAuditColumns } from './_lib/columns';
import { statCards } from './_lib/stats';
import { LogsFilters } from './_components/LogsFilters';
import { ErrorDetail, AuditDetail } from './_components/LogDetails';

export default function LogsPage() {
  const [tab, setTab] = useState<LogTab>('errors');
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: Record<string, any>) => {
      if (tab === 'errors') return adminApi.getErrorLogs(params);
      if (tab === 'security') return adminApi.getSecurityLogs(params);
      if (tab === 'emails') return adminApi.getEmailLogs(params);
      return adminApi.getAuditLogs({
        page: params.page,
        limit: params.limit,
        ...(params.search ? { search: params.search } : {}),
        action: params.action || undefined,
        ...(params.entityType ? { entityType: params.entityType } : {}),
        adminId: params.adminId || undefined,
        fromDate: params.fromDate || undefined,
        toDate: params.toDate || undefined,
      });
    },
    [tab],
  );

  const r = useAdminResource<AnyLog>({
    queryKey: `logs:${tab}`,
    fetcher,
    limit: 20,
    syncUrl: true,
    errorMessage: 'Loglar yüklenirken bir hata oluştu',
    initialFilters:
      tab === 'audit' ? { action: '', entityType: '', adminId: '', fromDate: '', toDate: '' } : {},
  });

  // Stats + toplam, ham backend yanıtından türetilir (render sırasında setState yok).
  const stats = (r.data as any)?.stats ?? null;
  const metaTotal = r.total;

  const handleTabChange = (key: string) => {
    setTab(key as LogTab);
    setExpandedErrorId(null);
    setExpandedAuditId(null);
  };

  const handleResolve = async (id: string) => {
    try {
      await adminApi.resolveSecurityIssue(id);
      toast.success('Sorun çözümlendi');
      r.refetch();
    } catch {
      toast.error('İşlem başarısız');
    }
  };

  const columns =
    tab === 'errors'
      ? buildErrorColumns({ expandedId: expandedErrorId, setExpandedId: setExpandedErrorId })
      : tab === 'security'
        ? buildSecurityColumns(handleResolve)
        : tab === 'emails'
          ? buildEmailColumns()
          : buildAuditColumns({ expandedId: expandedAuditId, setExpandedId: setExpandedAuditId });
  const tableColumns = columns as unknown as ColumnDef<AnyLog, any>[];

  const expandedId = tab === 'errors' ? expandedErrorId : tab === 'audit' ? expandedAuditId : null;
  const renderExpanded =
    tab === 'errors'
      ? (row: AnyLog) => (
          <div className="px-4 pb-4">
            <ErrorDetail log={row as ErrorLog} />
          </div>
        )
      : tab === 'audit'
        ? (row: AnyLog) => (
            <div className="px-4 pb-4">
              <AuditDetail log={row as AuditLog} />
            </div>
          )
        : undefined;

  const tabMeta = LOG_TABS.find((t) => t.key === tab)!;
  const cards = statCards(tab, stats, metaTotal);

  return (
    <AdminPage>
      <PageHeader title="Loglar" description="Sistem hataları, güvenlik olayları, e-postalar ve admin işlemleri">
        <Button variant="secondary" onClick={() => r.refetch()} title="Yenile">
          <ArrowPathIcon className={cn('h-5 w-5', r.isLoading && 'animate-spin')} />
        </Button>
      </PageHeader>

      <AdminTabs
        tabs={LOG_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon as any }))}
        value={tab}
        onChange={handleTabChange}
      />

      <p className="-mt-2 flex items-center gap-2 text-sm text-muted">
        <tabMeta.icon className="h-4 w-4 shrink-0" />
        {tabMeta.description}
      </p>

      {stats && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {cards.map((c) => (
            <MetricCard key={c.label} icon={c.icon} tone={c.tone} label={c.label} value={c.value} />
          ))}
        </div>
      )}

      <FilterToolbar
        search={r.search}
        onSearchChange={r.setSearch}
        onSearchSubmit={r.onSearchSubmit}
        searchPlaceholder={SEARCH_PLACEHOLDERS[tab]}
      >
        <LogsFilters tab={tab} filters={r.filters} setFilter={r.setFilter} />
      </FilterToolbar>

      <DataTable<AnyLog>
        columns={tableColumns}
        data={r.rows}
        loading={r.isLoading}
        emptyText={EMPTY_TEXT[tab]}
        getRowId={(row) => row.id}
        expandedId={expandedId}
        renderExpanded={renderExpanded}
      />

      <Pagination page={r.page} totalPages={r.totalPages} onPageChange={r.setPage} />
    </AdminPage>
  );
}
