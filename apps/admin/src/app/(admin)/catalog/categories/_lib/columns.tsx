import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { col } from '@/components/table';
import { ActiveBadge } from '@/components/ActiveBadge';
import { ActionIconButton } from '@/components/admin-list';
import type { Category } from './types';

export interface CategoryRowActions {
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}

export function categoryColumns({ onEdit, onDelete }: CategoryRowActions) {
  return [
    col.text<Category>('Kategori', (c) => c.name, { minWidth: 200 }),
    col.muted<Category>('Açıklama', (c) => c.description, { minWidth: 220 }),
    col.number<Category>('Ürün', (c) => c.productCount),
    col.number<Category>('Koleksiyon', (c) => c.collectionCount),
    col.badge<Category>('Durum', (c) => <ActiveBadge active={c.isActive} />),
    col.actions<Category>((c) => (
      <>
        <ActionIconButton icon={PencilIcon} onClick={() => onEdit(c)} title="Düzenle" />
        <ActionIconButton
          icon={TrashIcon}
          onClick={() => onDelete(c)}
          title="Sil"
          variant="danger"
          disabled={c.productCount > 0}
        />
      </>
    )),
  ];
}
