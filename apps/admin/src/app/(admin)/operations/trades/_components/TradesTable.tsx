'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { useResourceList } from '@/components/list';
import { tradeColumns } from '../_lib/columns';
import { tradeRowMenu } from '../_lib/rowActions';
import { type Trade, mapTrades } from '../_lib/trades';

export function TradesTable() {
  const router = useRouter();
  const { rows, isLoading } = useResourceList<any>();
  const trades = useMemo(() => mapTrades(rows), [rows]);

  const columns = tradeColumns(tradeRowMenu((t) => router.push(`/operations/trades/${t.id}`)));

  return (
    <DataTable
      columns={columns}
      data={trades}
      loading={isLoading}
      emptyText="Takas bulunamadı"
      getRowId={(t) => t.id}
      rowClassName={(t) => (t.hasDispute ? 'bg-danger-900/10' : '')}
    />
  );
}
