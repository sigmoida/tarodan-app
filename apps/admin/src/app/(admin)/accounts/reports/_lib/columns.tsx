import { Badge } from '@tarodan/ui';
import { useTranslations } from 'next-intl';
import { col } from '@/components/table';
import {
  type Report,
  reportStatusConfig,
  reportTypeLabels,
  reportReasonLabels,
} from './types';

type T = ReturnType<typeof useTranslations<never>>;

export function reportColumns({ t }: { t: T }) {
  const typeLabels = reportTypeLabels(t);
  const reasonLabels = reportReasonLabels(t);
  const statusConfig = reportStatusConfig(t);
  return [
    col.text<Report>(t('admin.reports.columns.type'), (r) => typeLabels[r.type] ?? r.type, {
      grow: 1,
      minWidth: 110,
    }),
    col.text<Report>(
      t('admin.reports.columns.reason'),
      (r) => reasonLabels[r.reason] ?? r.reason,
    ),
    col.muted<Report>(t('common.description'), (r) => r.description || null, {
      grow: 3,
      minWidth: 220,
    }),
    col.user<Report>(t('admin.reports.columns.reporter'), (r) =>
      r.reporter
        ? { name: r.reporter.displayName, secondary: r.reporter.email }
        : null,
    ),
    col.code<Report>(t('admin.reports.columns.targetId'), (r) => r.targetId),
    col.date<Report>(t('common.date'), (r) => r.createdAt),
    col.badge<Report>(t('common.status'), (r) => (
      <Badge status={r.status} config={statusConfig} />
    )),
  ];
}
