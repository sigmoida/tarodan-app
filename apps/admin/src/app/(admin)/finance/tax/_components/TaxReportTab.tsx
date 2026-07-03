'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Select } from '@tarodan/ui';
import {
  CurrencyDollarIcon,
  ChartBarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { MetricCard } from '@/components/MetricCard';
import { DataTable } from '@/components/DataTable';
import { col } from '@/components/table';
import { fmtTry } from '@/lib/format';
import { type TaxReport, groupByOptions } from '../_lib/types';

type Row = TaxReport['breakdown'][number];

export function TaxReportTab() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('month');

  const { data: report } = useQuery({
    queryKey: ['tax-report', from, to, groupBy],
    queryFn: async () =>
      (await adminApi.getTaxReport({ fromDate: from, toDate: to, groupBy })).data as TaxReport,
  });

  const columns = [
    col.text<Row>('Dönem', (r) => r.period),
    col.money<Row>('Vergi', (r) => r.taxCollected),
    col.money<Row>('Ciro', (r) => r.revenue),
    col.number<Row>('Adet', (r) => r.count),
  ];

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-wrap items-end gap-4">
          <Input
            type="date"
            label="Başlangıç"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input type="date" label="Bitiş" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select
            label="Grupla"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            options={groupByOptions}
          />
        </div>
      </SectionCard>

      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              icon={CurrencyDollarIcon}
              tone="success"
              label="Toplam Tahsil Edilen Vergi"
              value={fmtTry(report.summary.totalTaxCollected)}
            />
            <MetricCard
              icon={ChartBarIcon}
              tone="primary"
              label="Toplam Ciro"
              value={fmtTry(report.summary.totalRevenue)}
            />
            <MetricCard
              icon={DocumentTextIcon}
              tone="info"
              label="Fatura Sayısı"
              value={report.summary.invoiceCount}
            />
          </div>

          <SectionCard title="Dönem Bazlı Vergi">
            <DataTable
              columns={columns}
              data={report.breakdown}
              getRowId={(r) => r.period}
              emptyText="Bu dönemde fatura yok."
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}
