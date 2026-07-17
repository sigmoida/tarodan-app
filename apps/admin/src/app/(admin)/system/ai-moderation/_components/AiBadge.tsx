import { useTranslations } from 'next-intl';

/** AI moderation result pill — shared between the queue and the image tester. */
export function AiBadge({ state }: { state: 'flagged' | 'review' | 'passed' }) {
  const t = useTranslations();
  const CONFIG = {
    flagged: ['bg-danger-500/20 text-danger-600', t('admin.aiModeration.badge.flagged')],
    review: ['bg-warning-500/20 text-warning-700', t('admin.aiModeration.badge.review')],
    passed: ['bg-success-500/20 text-success-700', t('admin.aiModeration.badge.passed')],
  } as const;
  const [cls, label] = CONFIG[state];
  return <span className={`rounded px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}
