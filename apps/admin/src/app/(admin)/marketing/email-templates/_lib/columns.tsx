import { Badge } from '@tarodan/ui';
import { col } from '@/components/table';
import { templateRowMenu } from './rowActions';
import type { TemplateListItem } from './types';

export function templateColumns(onEdit: (key: string) => void) {
  return [
    col.code<TemplateListItem>('Anahtar', (t) => t.key),
    col.text<TemplateListItem>('Ad', (t) => t.name, { grow: 2, minWidth: 160 }),
    col.muted<TemplateListItem>('Konu', (t) => t.subject || 'Varsayılan', { grow: 3, minWidth: 200 }),
    col.badge<TemplateListItem>('Durum', (t) =>
      t.hasCustomBody ? (
        <Badge variant="success" size="sm">
          Özel
        </Badge>
      ) : (
        <Badge variant="secondary" size="sm">
          Varsayılan
        </Badge>
      ),
    ),
    col.rowMenu<TemplateListItem>(templateRowMenu(onEdit)),
  ];
}
