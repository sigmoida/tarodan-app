import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAdminMutation } from '@/hooks/useAdminMutation';

interface UseRateSettingOptions {
  /** react-query anahtarı; mutation da bunu invalidate eder. */
  queryKey: string;
  /** Mevcut oranı yükler (0..100 arası sayı). */
  load: () => Promise<number | null | undefined>;
  /** Yeni oranı kaydeder. */
  save: (rate: number) => Promise<unknown>;
  successMessage: string;
  /** Yükleme öncesi başlangıç değeri. */
  fallback?: string;
  min?: number;
  max?: number;
}

/**
 * "Tek bir oran/eşiği yükle → düzenle → doğrula (min..max) → kaydet" deseni.
 * TradeRateCard, stopaj oranı gibi kartlardaki tekrar eden useQuery + local
 * state + useAdminMutation bloğunu tek yerde toplar.
 */
export function useRateSetting({
  queryKey,
  load,
  save,
  successMessage,
  fallback = '',
  min = 0,
  max = 100,
}: UseRateSettingOptions) {
  const [value, setValue] = useState(fallback);

  const { data } = useQuery({ queryKey: [queryKey], queryFn: load });
  useEffect(() => {
    if (data != null) setValue(String(data));
  }, [data]);

  const mutation = useAdminMutation((rate: number) => save(rate), {
    invalidates: [queryKey],
    successMessage,
  });

  const onSave = () => {
    const n = Number(value);
    if (Number.isNaN(n) || n < min || n > max) {
      toast.error(`Oran ${min} ile ${max} arasında olmalı`);
      return;
    }
    mutation.mutate(n);
  };

  return { value, setValue, onSave, isPending: mutation.isPending };
}
