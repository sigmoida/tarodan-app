import { Badge } from '@tarodan/ui';
import { col, TruncatedText } from '@/components/table';
import { carModelRowMenu, type CarModelRowActions } from './rowActions';
import type { CarModel } from './types';

export function carModelColumns(actions: CarModelRowActions) {
  return [
    col.custom<CarModel>(
      'Model',
      (m) => (
        <div className="min-w-0">
          <TruncatedText className="font-medium text-heading">{m.name}</TruncatedText>
          <TruncatedText className="text-xs text-muted">{m.slug}</TruncatedText>
        </div>
      ),
      { grow: 3, minWidth: 180 },
    ),
    col.text<CarModel>('Marka', (m) => m.brand?.name),
    col.text<CarModel>(
      'Yıl',
      (m) => (m.yearStart || m.yearEnd ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}` : undefined),
      { minWidth: 120 },
    ),
    col.badge<CarModel>('Durum', (m) => <Badge active={m.isActive} />),
    col.rowMenu<CarModel>(carModelRowMenu(actions)),
  ];
}
