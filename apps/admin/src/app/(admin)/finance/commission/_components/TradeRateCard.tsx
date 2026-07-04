'use client';

import { Button, Input } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { useRateSetting } from '@/hooks/useRateSetting';

export function TradeRateCard() {
  const { value: rate, setValue: setRate, onSave, isPending } = useRateSetting({
    queryKey: 'trade-commission-rate',
    load: async () => (await adminApi.getTradeCommissionRate()).data?.rate as number | undefined,
    save: (r) => adminApi.setTradeCommissionRate(r),
    successMessage: 'Takas komisyon oranı güncellendi',
    fallback: '5',
  });

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
        <Button onClick={onSave} isLoading={isPending}>
          Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}
