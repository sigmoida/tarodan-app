import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { col, TruncatedText } from '@/components/table';
import { StatusToggle } from '@/components/ActiveBadge';
import { ActionIconButton } from '@/components/AdminList';
import type { CarModel } from './types';

export interface CarModelRowActions {
  onEdit: (m: CarModel) => void;
  onDelete: (m: CarModel) => void;
  onToggle: (m: CarModel) => void;
  busyId?: string | null;
}

export function carModelColumns({ onEdit, onDelete, onToggle, busyId }: CarModelRowActions) {
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
    col.badge<CarModel>('Durum', (m) => (
      <StatusToggle active={m.isActive} onToggle={() => onToggle(m)} busy={busyId === m.id} />
    )),
    col.actions<CarModel>((m) => (
      <>
        <ActionIconButton icon={PencilIcon} onClick={() => onEdit(m)} title="Düzenle" />
        <ActionIconButton icon={TrashIcon} onClick={() => onDelete(m)} title="Sil" variant="danger" />
      </>
    )),
  ];
}
