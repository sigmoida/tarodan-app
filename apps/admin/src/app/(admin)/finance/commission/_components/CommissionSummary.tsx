'use client';

import { useQuery } from '@tanstack/react-query';
import { BanknotesIcon, UserIcon, BuildingStorefrontIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { fmtTry } from '@/lib/format';
import { type CommissionRevenue } from '../_lib/types';

export function CommissionSummary() {
  const { data } = useQuery<CommissionRevenue>({
    queryKey: ['commission-revenue'],
    queryFn: async () => (await adminApi.getCommissionRevenue()).data,
  });

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <MetricCard
        icon={BanknotesIcon}
        tone="success"
        label="Toplam Tahsil Edilen Komisyon"
        value={fmtTry(data.totalCommission)}
        footer={<span className="text-muted">Tamamlanan siparişler</span>}
      />
      <MetricCard
        icon={UserIcon}
        tone="info"
        label="Alıcı Hizmet Bedeli"
        value={fmtTry(data.totalBuyerFee ?? 0)}
      />
      <MetricCard
        icon={BuildingStorefrontIcon}
        tone="primary"
        label="Satıcı Komisyonu"
        value={fmtTry(data.totalSellerFee ?? 0)}
      />
    </div>
  );
}
