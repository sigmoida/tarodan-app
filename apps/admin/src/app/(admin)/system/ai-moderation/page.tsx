'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Alert } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { AiThresholdsCard } from './_components/AiThresholdsCard';
import { ImageTestCard } from './_components/ImageTestCard';
import { type AiModerationConfig } from './_lib/types';

export default function AiModerationPage() {
  const t = useTranslations();
  const { data: config } = useQuery<AiModerationConfig>({
    queryKey: ['ai-moderation-config'],
    queryFn: async () => {
      const res = await adminApi.get('/admin/moderation/ai-config');
      return {
        enabled: res.data?.enabled !== false,
        relevanceThreshold: res.data?.relevanceThreshold ?? 0.2,
        nsfwThreshold: res.data?.nsfwThreshold ?? 0.7,
      };
    },
  });

  return (
    <AdminPage>
      <PageHeader
        title={t('admin.aiModeration.page.title')}
        description={t('admin.aiModeration.page.description')}
      />

      {config?.enabled === false && (
        <Alert variant="warning">{t('admin.aiModeration.page.disabledWarning')}</Alert>
      )}

      <ImageTestCard />
      <AiThresholdsCard config={config} />

      <ModerationEventsPanel
        showEntityColumn
        title={t('admin.aiModeration.page.logTitle')}
        description={t('admin.aiModeration.page.logDescription')}
      />
    </AdminPage>
  );
}
