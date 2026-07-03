'use client';

import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { ticketColumns } from '../_lib/columns';
import {
  type SupportTicket,
  ticketStatusOptions,
  ticketPriorityOptions,
  ticketCategoryOptions,
} from '../_lib/types';

/** Support tickets — server-paginated list (getTickets uses `pageSize`). */
export function TicketsTab() {
  const router = useRouter();

  return (
    <ResourceList<SupportTicket>
      resource="tickets"
      fetcher={(params) => {
        const { limit, ...rest } = params;
        return adminApi.getTickets({ ...rest, pageSize: limit });
      }}
      getRowId={(t) => t.id}
      syncUrl
      initialFilters={{ status: 'all', priority: 'all', category: 'all' }}
      errorMessage="Destek talepleri yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Konu veya talep no ara..." />
        <ResourceList.FilterSelect
          name="status"
          options={ticketStatusOptions}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="priority"
          options={ticketPriorityOptions}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="category"
          options={ticketCategoryOptions}
          className="sm:w-44"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={ticketColumns}
        onRowClick={(t) => router.push(`/messaging/support/${t.id}`)}
        emptyText="Destek talebi bulunamadı"
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
