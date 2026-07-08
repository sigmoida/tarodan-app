'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { AiThresholdsCard } from './_components/AiThresholdsCard';
import { ImageTestCard } from './_components/ImageTestCard';
import { type AiModerationConfig } from './_lib/types';

export default function AiModerationPage() {
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
        title="AI Denetim"
        description="Tüm varlıklar (ürün · kullanıcı · koleksiyon · görsel · metin) için ortak AI moderasyonu — eşikler, görsel testi ve birleşik olay günlüğü"
      />

      {config?.enabled === false && (
        <Alert variant="warning">
          AI moderasyon servisi kapalı (AI_MODERATION_ENABLED=false). Eşik ayarı ve görsel testi
          devre dışı; geçmiş günlük kayıtları yine listelenir.
        </Alert>
      )}

      <ImageTestCard />
      <AiThresholdsCard config={config} />

      <ModerationEventsPanel
        showEntityColumn
        title="Denetim Günlüğü"
        description="Tüm varlıklarda AI tarafından engellenen / işaretlenen içerikler"
      />
    </AdminPage>
  );
}
