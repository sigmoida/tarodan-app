'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

export function TradeRateCard() {
  const [rate, setRate] = useState('5');

  const { data } = useQuery({
    queryKey: ['trade-commission-rate'],
    queryFn: async () => (await adminApi.getTradeCommissionRate()).data?.rate as number | undefined,
  });
  useEffect(() => {
    if (data != null) setRate(String(data));
  }, [data]);

  const save = useAdminMutation((r: number) => adminApi.setTradeCommissionRate(r), {
    invalidates: ['trade-commission-rate'],
    successMessage: 'Takas komisyon oranı güncellendi',
  });

  const onSave = () => {
    const r = Number(rate);
    if (!(r >= 0 && r <= 100)) {
      toast.error('Oran 0 ile 100 arasında olmalı');
      return;
    }
    save.mutate(r);
  };

  return (
    <SectionCard title="Takas Komisyonu" bodyClassName="space-y-4">
      <p className="text-sm text-muted">
        Takasta nakit farkı ödeyen taraftan alınan komisyon oranı. Faturası, ürünler{' '}
        <b>depoya ulaşınca</b> kesilir (ödeme anında değil) — iptal edilirse fatura oluşmaz.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          label="Oran (%)"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="w-32"
        />
        <Button onClick={onSave} isLoading={save.isPending}>
          Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}
