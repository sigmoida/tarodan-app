import { Badge } from '@tarodan/ui';
import { col } from '@/components/table';
import {
  type Report,
  reportStatusConfig,
  reportTypeLabels,
  reportReasonLabels,
} from './types';

export const reportColumns = [
  col.text<Report>('Tür', (r) => reportTypeLabels[r.type] ?? r.type, {
    grow: 1,
    minWidth: 110,
  }),
  col.text<Report>('Neden', (r) => reportReasonLabels[r.reason] ?? r.reason),
  col.muted<Report>('Açıklama', (r) => r.description || null, {
    grow: 3,
    minWidth: 220,
  }),
  col.user<Report>('Raporlayan', (r) =>
    r.reporter
      ? { name: r.reporter.displayName, secondary: r.reporter.email }
      : null,
  ),
  col.code<Report>('Hedef ID', (r) => r.targetId),
  col.date<Report>('Tarih', (r) => r.createdAt),
  col.badge<Report>('Durum', (r) => (
    <Badge status={r.status} config={reportStatusConfig} />
  )),
];
