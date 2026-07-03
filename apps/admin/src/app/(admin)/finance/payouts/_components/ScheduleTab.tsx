'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/clientList';
import { scheduleColumns } from '../_lib/columns';
import { type ScheduleItem } from '../_lib/types';

export function ScheduleTab() {
  return (
    <ResourceList<ScheduleItem>
      resource="payouts-schedule"
      fetcher={clientListFetcher<ScheduleItem>(
        () => adminApi.getPayoutsSchedule({ limit: 50 }),
        (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
      )}
      getRowId={(s) => s.id}
      errorMessage="Takvim yüklenemedi"
    >
      <ResourceList.Table columns={scheduleColumns} emptyText="Yaklaşan ödeme yok" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
