import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAdminMutation } from '@/hooks/useAdminMutation';

interface UseRateSettingOptions {
  /** react-query key; the mutation also invalidates this. */
  queryKey: string;
  /** Loads the current rate (a number between 0..100). */
  load: () => Promise<number | null | undefined>;
  /** Saves the new rate. */
  save: (rate: number) => Promise<unknown>;
  successMessage: string;
  /** Initial value before loading. */
  fallback?: string;
  min?: number;
  max?: number;
}

/**
 * The "load a single rate/threshold → edit → validate (min..max) → save" pattern.
 * Collects the repeated useQuery + local state + useAdminMutation block from
 * cards like TradeRateCard or the withholding-rate card in one place.
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
