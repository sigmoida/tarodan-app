'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { type CronDef } from '../_lib/types';

/** Manually trigger scheduled jobs (harmless: only runs work that would run anyway). */
export function CronsCard() {
  const { data: crons = [] } = useQuery<CronDef[]>({
    queryKey: ['test-tools-crons'],
    queryFn: async () => (await adminApi.get('/admin/test-tools/crons')).data,
  });

  const runCronMut = useMutation({
    mutationFn: (key: string) =>
      adminApi.post('/admin/test-tools/run-cron', { key }).then((r) => r.data),
    onSuccess: (data) => toast.success(`Çalıştı: ${JSON.stringify(data.result)}`),
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Cron çalıştırılamadı'),
  });

  return (
    <SectionCard
      title="Cron'lar"
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        Zamanlanmış işleri manuel tetikle (zararsız: yalnız zaten olacak işi erken yapar).
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {crons.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-heading">{c.label}</p>
              <p className="text-xs text-muted">{c.description}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => runCronMut.mutate(c.key)}
              isLoading={runCronMut.isPending && runCronMut.variables === c.key}
            >
              Çalıştır
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
