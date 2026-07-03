import { PencilIcon, TrashIcon, ChevronRightIcon, TruckIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { col, TruncatedText } from '@/components/table';
import { StatusToggle } from '@/components/ActiveBadge';
import { ActionIconButton } from '@/components/AdminList';
import type { Brand } from './types';

export interface BrandRowActions {
  onEdit: (b: Brand) => void;
  onDelete: (b: Brand) => void;
  onToggle: (b: Brand) => void;
  onToggleExpand: (id: string) => void;
  expandedId: string | null;
  busyId?: string | null;
}

export function brandColumns({
  onEdit,
  onDelete,
  onToggle,
  onToggleExpand,
  expandedId,
  busyId,
}: BrandRowActions) {
  return [
    col.custom<Brand>(
      'Marka',
      (b) => (
        <div className="flex min-w-0 items-center gap-3">
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logo} alt={b.name} className="h-10 w-10 rounded-lg bg-surface-alt object-contain" />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-border-subtle font-bold text-muted">
              {b.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">{b.name}</TruncatedText>
            <TruncatedText className="text-xs text-muted">{b.slug}</TruncatedText>
          </div>
        </div>
      ),
      { grow: 3, minWidth: 200 },
    ),
    col.badge<Brand>('Durum', (b) => (
      <StatusToggle active={b.isActive} onToggle={() => onToggle(b)} busy={busyId === b.id} />
    )),
    col.custom<Brand>(
      'Modeller',
      (b) => {
        const open = expandedId === b.id;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(b.id)}
            className={`inline-flex items-center gap-2 whitespace-nowrap ${open ? 'text-primary-700' : 'text-primary-600'}`}
          >
            <ChevronRightIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
            <TruckIcon className="h-4 w-4" />
            Modeller
          </Button>
        );
      },
      { minWidth: 140 },
    ),
    col.actions<Brand>((b) => (
      <>
        <ActionIconButton icon={PencilIcon} onClick={() => onEdit(b)} title="Düzenle" />
        <ActionIconButton icon={TrashIcon} onClick={() => onDelete(b)} title="Sil" variant="danger" />
      </>
    )),
  ];
}
