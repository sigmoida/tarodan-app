import { Button } from '@tarodan/ui';
import { col } from '@/components/table';
import { type SearchItem, type AdjustAction, fmt } from './types';

export interface TimeAdjustColumnProps {
  minutes: number;
  days: number;
  onAdjust: (item: SearchItem, action: AdjustAction, value: number) => void;
}

export function timeAdjustColumns({ minutes, days, onAdjust }: TimeAdjustColumnProps) {
  return [
    col.custom<SearchItem>('Kayıt', (item) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-heading">{item.label}</div>
        <div className="truncate text-xs text-subtle">{item.id}</div>
      </div>
    )),
    col.muted<SearchItem>('Durum', (item) => item.status ?? '—'),
    col.custom<SearchItem>('Tarihler', (item) => (
      <div className="space-y-0.5">
        {Object.entries(item.dates).map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-muted">{k}:</span> {fmt(v)}
          </div>
        ))}
      </div>
    )),
    col.custom<SearchItem>(
      'Aksiyon',
      (item) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => onAdjust(item, 'expire_now', 0)}>
            Şimdi bitir
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAdjust(item, 'set_minutes', minutes)}>
            {minutes} dk sonra
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAdjust(item, 'backdate_days', days)}>
            {days} gün geri
          </Button>
        </div>
      ),
      { grow: 3, minWidth: 260 },
    ),
  ];
}
