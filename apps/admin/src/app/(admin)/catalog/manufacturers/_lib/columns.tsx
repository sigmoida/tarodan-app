import { PencilIcon, TrashIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { col, TruncatedText, Empty } from '@/components/table';
import { StatusToggle } from '@/components/ActiveBadge';
import { ActionIconButton } from '@/components/AdminList';
import type { Manufacturer } from './types';

export interface ManufacturerRowActions {
  onEdit: (m: Manufacturer) => void;
  onDelete: (m: Manufacturer) => void;
  onToggle: (m: Manufacturer) => void;
  busyId?: string | null;
}

export function manufacturerColumns({ onEdit, onDelete, onToggle, busyId }: ManufacturerRowActions) {
  return [
    col.custom<Manufacturer>(
      'Üretici',
      (m) => (
        <div className="flex min-w-0 items-center gap-3">
          {m.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.logo} alt={m.name} className="h-10 w-10 rounded-lg bg-surface-alt object-contain" />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-border-subtle font-bold text-muted">
              {m.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">{m.name}</TruncatedText>
            <TruncatedText className="text-xs text-muted">{m.slug}</TruncatedText>
          </div>
        </div>
      ),
      { grow: 3, minWidth: 200 },
    ),
    col.text<Manufacturer>('Ülke', (m) => m.country),
    col.custom<Manufacturer>('Website', (m) =>
      m.website ? (
        <a
          href={m.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-info-600 hover:underline"
        >
          <GlobeAltIcon className="h-4 w-4" />
          Ziyaret Et
        </a>
      ) : (
        <Empty />
      ),
    ),
    col.badge<Manufacturer>('Durum', (m) => (
      <StatusToggle active={m.isActive} onToggle={() => onToggle(m)} busy={busyId === m.id} />
    )),
    col.actions<Manufacturer>((m) => (
      <>
        <ActionIconButton icon={PencilIcon} onClick={() => onEdit(m)} title="Düzenle" />
        <ActionIconButton icon={TrashIcon} onClick={() => onDelete(m)} title="Sil" variant="danger" />
      </>
    )),
  ];
}
