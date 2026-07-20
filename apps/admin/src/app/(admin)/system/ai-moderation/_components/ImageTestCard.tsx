'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { SectionCard } from '@/components/detail/SectionCard';
import { AiBadge } from './AiBadge';
import { type ImageTestResult, decisionState } from '../_lib/types';

/** Score an image URL (or uploaded file) without persisting anything. */
export function ImageTestCard() {
  const t = useTranslations();
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ImageTestResult | null>(null);

  const testMut = useAdminMutation(
    (target: string) =>
      adminApi
        .post('/admin/moderation/test-image', { imageUrl: target })
        .then((r) => r.data as ImageTestResult),
    {
      errorMessage: t('admin.aiModeration.imageTest.testFailed'),
      onSuccess: (data) => setResult(data),
      mutation: { onMutate: () => setResult(null) },
    },
  );
  const testing = testMut.isPending;

  const runTest = (override?: string) => {
    const target = (override ?? url).trim();
    if (!target) return;
    testMut.mutate(target);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUrl(dataUrl);
      runTest(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <SectionCard title={t('admin.aiModeration.imageTest.title')} bodyClassName="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runTest()}
          placeholder={t('admin.aiModeration.imageTest.urlPlaceholder')}
          className="min-w-0 flex-1"
        />
        <Button onClick={() => runTest()} isLoading={testing} disabled={!url.trim()}>
          {t('admin.aiModeration.imageTest.testButton')}
        </Button>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted">
        {t('admin.aiModeration.imageTest.orLabel')}{' '}
        <span className="text-primary-600 underline">
          {t('admin.aiModeration.imageTest.chooseFile')}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={onFile} />
      </label>

      {result && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="test" className="h-16 w-16 shrink-0 rounded object-cover" />
          )}
          {result.error || result.enabled === false ? (
            <span className="text-sm text-danger-600">{result.error || result.message}</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <AiBadge state={decisionState(result.decision)} />
              <span className="text-sm text-body">
                {t('admin.aiModeration.imageTest.scores', {
                  relevance: Math.round((result.relevanceScore ?? 0) * 100),
                  nsfw: ((result.nsfwScore ?? 0) * 100).toFixed(2),
                })}
              </span>
              <span className="text-xs text-muted">
                {t('admin.aiModeration.imageTest.labels')}{' '}
                {(result.topLabels || []).slice(0, 3).map((l) => l.label).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
