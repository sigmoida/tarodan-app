'use client';

import { useQuery } from '@tanstack/react-query';
import { BanknotesIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/detail/SectionCard';
import { fmtTry } from '@/lib/format';
import { type PayoutSummary } from '../_lib/types';

export function PayoutsSummary() {
  const { data } = useQuery<PayoutSummary>({
    queryKey: ['payouts-summary'],
    queryFn: async () => (await adminApi.getPayoutsSummary()).data,
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={BanknotesIcon}
        tone="warning"
        label="Bekleyen Toplam"
        value={data ? fmtTry(data.totalPending) : '—'}
        footer={<span className="text-muted">{data?.countHeld ?? 0} işlem</span>}
      />
      <MetricCard
        icon={CheckCircleIcon}
        tone="success"
        label="Ödenen Toplam"
        value={data ? fmtTry(data.totalReleased) : '—'}
        footer={<span className="text-muted">{data?.countReleased ?? 0} işlem</span>}
      />
      <SectionCard title="Yaklaşan Serbest Bırakmalar" className="md:col-span-2">
        <ul className="space-y-1">
          {data?.nextReleases?.length ? (
            data.nextReleases.slice(0, 3).map((r) => (
              <li key={r.id} className="flex min-w-0 justify-between gap-2 text-sm text-muted">
                <span className="truncate">Sipariş #{r.orderId.slice(0, 8)}...</span>
                <span className="shrink-0 whitespace-nowrap">
                  {fmtTry(r.amount)} —{' '}
                  {r.releaseAt ? new Date(r.releaseAt).toLocaleDateString('tr-TR') : '-'}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted">Bekleyen yok</li>
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
