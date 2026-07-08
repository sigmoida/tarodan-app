'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Badge } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { CronsCard } from './_components/CronsCard';
import { TimeAdjustCard } from './_components/TimeAdjustCard';
import { type TestEnv } from './_lib/types';

export default function TestToolsPage() {
  const { data: env } = useQuery<TestEnv>({
    queryKey: ['test-tools-env'],
    queryFn: async () => (await adminApi.get('/admin/test-tools/environment')).data,
  });

  return (
    <AdminPage>
      <PageHeader title="Test Araçları — Zaman Makinesi" description="Süre bağımlı akışları manuel test et">
        {env && (
          <Badge variant={env.isProd ? 'danger' : 'secondary'}>
            {env.isProd ? '⚠ PROD' : env.env}
          </Badge>
        )}
      </PageHeader>

      {env?.isProd && (
        <Alert variant="danger">
          PROD ortamındasın. Süre değişiklikleri <b>gerçek müşteri verisini</b> etkiler. Her işlem
          audit log&apos;a yazılır. Dikkatli ol.
        </Alert>
      )}

      <CronsCard />
      <TimeAdjustCard isProd={!!env?.isProd} />
    </AdminPage>
  );
}
