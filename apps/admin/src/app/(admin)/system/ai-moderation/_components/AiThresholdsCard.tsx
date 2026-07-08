'use client';

import { useEffect, useState } from 'react';
import { Button, Slider } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { type AiModerationConfig } from '../_lib/types';

/** Relevance auto-accept + NSFW block thresholds (stored 0..1, edited as %). */
export function AiThresholdsCard({ config }: { config?: AiModerationConfig }) {
  const [rel, setRel] = useState(20);
  const [nsfw, setNsfw] = useState(70);

  useEffect(() => {
    if (!config) return;
    setRel(Math.round(config.relevanceThreshold * 100));
    setNsfw(Math.round(config.nsfwThreshold * 100));
  }, [config]);

  const save = useAdminMutation(
    () =>
      adminApi.post('/admin/moderation/ai-config', {
        relevanceThreshold: rel / 100,
        nsfwThreshold: nsfw / 100,
      }),
    { invalidates: ['ai-moderation-config'], successMessage: 'Eşikler kaydedildi' },
  );

  const disabled = config?.enabled === false;

  return (
    <SectionCard title="AI Eşikleri" bodyClassName="space-y-4">
      <Slider
        min={0}
        max={100}
        value={rel}
        onChange={(e) => setRel(Number(e.target.value))}
        label="Kabul eşiği (ilgililik %)"
        valueLabel={`%${rel}`}
        helperText="Ürün görseli bu yüzdenin üstünde ilgililik alırsa otomatik kabul edilir; altındakiler admin onayına düşer."
      />
      <Slider
        min={0}
        max={100}
        value={nsfw}
        onChange={(e) => setNsfw(Number(e.target.value))}
        label="Uygunsuzluk eşiği (NSFW %)"
        valueLabel={`%${nsfw}`}
        helperText="Bir görselin uygunsuzluk skoru bu yüzdeyi aşarsa engellenir (avatar, koleksiyon, ürün ve diğer tüm görsel yüklemeleri kapsar)."
      />
      <div className="flex justify-end">
        <Button onClick={() => save.mutate(undefined)} isLoading={save.isPending} disabled={disabled}>
          Eşikleri Kaydet
        </Button>
      </div>
    </SectionCard>
  );
}
