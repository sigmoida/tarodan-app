'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { type CronDef } from '../_lib/types';

/** Manually trigger scheduled jobs (harmless: only runs work that would run anyway). */
export function CronsCard() {
  const [running, setRunning] = useState<string | null>(null);

  const { data: crons = [] } = useQuery<CronDef[]>({
    queryKey: ['test-tools-crons'],
    queryFn: async () => (await adminApi.get('/admin/test-tools/crons')).data,
  });

  const runCron = async (key: string) => {
    setRunning(key);
    try {
      const r = await adminApi.post('/admin/test-tools/run-cron', { key });
      toast.success(`Çalıştı: ${JSON.stringify(r.data.result)}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Cron çalıştırılamadı');
    } finally {
      setRunning(null);
    }
  };

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
              onClick={() => runCron(c.key)}
              isLoading={running === c.key}
            >
              Çalıştır
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
