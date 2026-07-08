import { Badge } from '@tarodan/ui';
import { col } from '@/components/table';
import { categoryRowMenu, type CategoryRowActions } from './rowActions';
import type { Category } from './types';

export function categoryColumns(actions: CategoryRowActions) {
  return [
    col.text<Category>('Kategori', (c) => c.name, { minWidth: 200 }),
    col.muted<Category>('Açıklama', (c) => c.description, { minWidth: 220 }),
    col.number<Category>('Ürün', (c) => c.productCount),
    col.number<Category>('Koleksiyon', (c) => c.collectionCount),
    col.badge<Category>('Durum', (c) => <Badge active={c.isActive} />),
    col.rowMenu<Category>(categoryRowMenu(actions)),
  ];
}
