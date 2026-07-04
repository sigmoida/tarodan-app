import { Badge } from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import { type Application, businessStatusConfig } from './types';

export function applicationColumns(rowMenu: (a: Application) => RowActionItem[]) {
  return [
    col.user<Application>('Firma', (a) => ({ name: a.companyName, secondary: a.email })),
    col.muted<Application>('Yetkili', (a) => a.displayName),
    col.badge<Application>('Durum', (a) => (
      <Badge status={a.businessStatus ?? 'pending'} config={businessStatusConfig} />
    )),
    col.date<Application>('Başvuru Tarihi', (a) => a.createdAt),
    col.rowMenu<Application>(rowMenu),
  ];
}
