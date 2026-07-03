import { PencilIcon, TrashIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { col, TruncatedText } from '@/components/table';
import { ActionIconButton } from '@/components/AdminList';
import type { Collection } from './types';

export interface CollectionRowActions {
  onToggleVisibility: (c: Collection) => void;
  onEdit: (c: Collection) => void;
  onDelete: (c: Collection) => void;
}

export function collectionColumns({ onToggleVisibility, onEdit, onDelete }: CollectionRowActions) {
  return [
    col.custom<Collection>(
      'Koleksiyon',
      (c) => (
        <div className="flex min-w-0 items-center gap-3">
          {c.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.coverImageUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-alt text-xs text-muted">
              N/A
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">{c.name}</TruncatedText>
            {c.description && <TruncatedText className="text-xs text-muted">{c.description}</TruncatedText>}
          </div>
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<Collection>('Sahibi', (c) => {
      const tier = c.owner?.membershipTier;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <TruncatedText className="text-body">{c.owner?.displayName}</TruncatedText>
          {(tier === 'premium' || tier === 'business') && (
            <span
              className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                tier === 'business' ? 'bg-info-50 text-info-700' : 'bg-warning-50 text-warning-700'
              }`}
            >
              {tier === 'business' ? 'İş' : 'Premium'}
            </span>
          )}
        </div>
      );
    }),
    col.number<Collection>('Ürün', (c) => c.itemCount),
    col.number<Collection>('Görüntüleme', (c) => c.viewCount),
    col.number<Collection>('Beğeni', (c) => c.likeCount),
    col.badge<Collection>('Durum', (c) =>
      c.isPublic ? (
        <span className="whitespace-nowrap rounded bg-success-50 px-2 py-1 text-xs text-success-700">
          Görünür
        </span>
      ) : (
        <span className="whitespace-nowrap rounded bg-surface-alt px-2 py-1 text-xs text-muted">Gizli</span>
      ),
    ),
    col.actions<Collection>((c) => (
      <>
        <ActionIconButton
          icon={c.isPublic ? EyeSlashIcon : EyeIcon}
          onClick={() => onToggleVisibility(c)}
          title={c.isPublic ? 'Gizle' : 'Görünür yap'}
        />
        <ActionIconButton icon={PencilIcon} onClick={() => onEdit(c)} title="Düzenle" />
        <ActionIconButton icon={TrashIcon} onClick={() => onDelete(c)} title="Sil" variant="danger" />
      </>
    )),
  ];
}
