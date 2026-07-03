'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@tarodan/ui';
import {
  ReceiptPercentIcon,
  UsersIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { SectionCard } from '@/components/detail/SectionCard';
import { MetricCard } from '@/components/MetricCard';
import { DataTable } from '@/components/DataTable';
import { col } from '@/components/table';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { fmtTry } from '@/lib/format';
import { type WithholdingReport, MONTHS } from '../_lib/types';

type Row = WithholdingReport['rows'][number];

export function WithholdingTab() {
  const now = new Date();
  const [whRate, setWhRate] = useState('1');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: rate } = useQuery({
    queryKey: ['withholding-rate'],
    queryFn: async () => (await adminApi.getWithholdingRate()).data?.rate as number | undefined,
  });
  useEffect(() => {
    if (rate != null) setWhRate(String(rate));
  }, [rate]);

  const { data: report } = useQuery({
    queryKey: ['withholding-report', year, month],
    queryFn: async () =>
      (await adminApi.getWithholdingReport({ year, month })).data as WithholdingReport | null,
  });

  const saveRate = useAdminMutation((r: number) => adminApi.setWithholdingRate(r), {
    invalidates: ['withholding-rate'],
    successMessage: 'Stopaj oranı güncellendi',
  });

  const onSaveRate = () => {
    const r = parseFloat(whRate);
    if (Number.isNaN(r) || r < 0 || r > 100) {
      toast.error('Oran 0 ile 100 arasında olmalı');
      return;
    }
    saveRate.mutate(r);
  };

  const exportCsv = () => {
    if (!report) return;
    const header = 'Satıcı;VKN/TCKN;E-posta;Transfer Adedi;Brüt Tutar (TL);Kesilen Stopaj (TL)';
    const lines = report.rows.map((r) =>
      [
        `"${(r.sellerName || '').replace(/"/g, '""')}"`,
        r.taxId ?? '',
        r.email ?? '',
        r.transferCount,
        r.grossAmount.toFixed(2).replace('.', ','),
        r.withholdingTax.toFixed(2).replace('.', ','),
      ].join(';'),
    );
    const total = `"TOPLAM";;;${report.summary.transferCount};;${report.summary.totalWithholding
      .toFixed(2)
      .replace('.', ',')}`;
    const csv = '﻿' + [header, ...lines, total].join('\r\n');
    downloadBlob(`stopaj-muhtasar-${report.period}.csv`, csv);
  };

  const columns = [
    col.text<Row>('Satıcı', (r) => r.sellerName),
    col.muted<Row>('VKN / TCKN', (r) => r.taxId || '–'),
    col.muted<Row>('E-posta', (r) => r.email || '–'),
    col.number<Row>('Transfer', (r) => r.transferCount),
    col.money<Row>('Brüt', (r) => r.grossAmount),
    col.money<Row>('Stopaj', (r) => r.withholdingTax),
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="E-Ticaret Stopajı (Tevkifat)" bodyClassName="space-y-4">
        <p className="text-sm text-muted">
          GVK 94/19 kapsamında, vergi mükellefi (kurumsal onaylı) satıcılara yapılan
          ödemelerden KDV hariç ürün bedeli üzerinden kesilir ve muhtasar beyanname ile
          ödenir. Bireysel satıcılar kapsam dışıdır.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            label="Stopaj Oranı (%)"
            value={whRate}
            onChange={(e) => setWhRate(e.target.value)}
            className="w-32"
          />
          <Button onClick={onSaveRate} isLoading={saveRate.isPending}>
            Kaydet
          </Button>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Yıl"
            value={String(year)}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            options={Array.from({ length: 4 }, (_, i) => {
              const y = now.getFullYear() - i;
              return { value: String(y), label: String(y) };
            })}
          />
          <Select
            label="Ay"
            value={String(month)}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
          />
          <Button
            variant="secondary"
            leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
            onClick={exportCsv}
            disabled={!report || report.rows.length === 0}
          >
            CSV İndir
          </Button>
        </div>
      </SectionCard>

      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard
              icon={ReceiptPercentIcon}
              tone="primary"
              label="Dönem Kesilen Stopaj"
              value={fmtTry(report.summary.totalWithholding)}
            />
            <MetricCard
              icon={UsersIcon}
              tone="info"
              label="Satıcı Sayısı"
              value={report.summary.sellerCount}
            />
            <MetricCard
              icon={ArrowsRightLeftIcon}
              tone="success"
              label="Transfer Sayısı"
              value={report.summary.transferCount}
            />
            <MetricCard
              icon={ClockIcon}
              tone="warning"
              label="Bekleyen Stopaj"
              value={fmtTry(report.summary.pendingWithholding)}
            />
          </div>

          <SectionCard title={`Satıcı Bazlı Stopaj — ${report.period}`}>
            <DataTable
              columns={columns}
              data={report.rows}
              getRowId={(r) => r.sellerId}
              emptyText="Bu dönemde stopaj kesilen ödeme yok."
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}
