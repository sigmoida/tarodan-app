'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/components/ConfirmProvider';
import { useTabParam } from '@/hooks/useTabParam';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import type { Collection } from './_lib/types';
import { collectionColumns } from './_lib/columns';
import { CollectionFormModal } from './_modals/CollectionFormModal';

const COLLECTION_TABS = [
  { key: 'list', label: 'Koleksiyonlar' },
  { key: 'ai', label: 'AI Denetim' },
];

const PUBLIC_OPTIONS = [
  { value: 'all', label: 'Tüm Görünürlük' },
  { value: 'true', label: 'Görünür' },
  { value: 'false', label: 'Gizli' },
];
const FEATURED_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'true', label: 'Öne Çıkan' },
];

export default function CollectionsPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useTabParam('list');
  const [modal, setModal] = useState<{ collection?: Collection } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteCollection(id), {
    invalidates: ['collections'],
    successMessage: 'Koleksiyon silindi',
  });
  const toggle = useAdminMutation(
    (c: Collection) => adminApi.setCollectionVisibility(c.id, !c.isPublic),
    { invalidates: ['collections'] },
  );

  const onDelete = async (c: Collection) => {
    if (
      await confirm({
        title: 'Koleksiyonu Sil',
        description: 'Bu koleksiyonu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        destructive: true,
      })
    )
      del.mutate(c.id);
  };

  const columns = collectionColumns({
    onToggleVisibility: (c) => toggle.mutate(c),
    onEdit: (c) => setModal({ collection: c }),
    onDelete,
  });

  if (tab === 'ai') {
    return (
      <ModerationEventsPanel
        entityType="collection"
        title="Koleksiyonlar"
        tabs={COLLECTION_TABS}
        activeTab={tab}
        onTabChange={setTab}
      />
    );
  }

  return (
    <>
      <ResourceList<Collection>
        resource="collections"
        fetcher={(params) =>
          adminApi.getCollections({
            page: params.page,
            limit: params.limit,
            search: params.search,
            isPublic: params.isPublic !== undefined ? params.isPublic === 'true' : undefined,
            isFeatured: params.isFeatured !== undefined ? params.isFeatured === 'true' : undefined,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
          })
        }
        getRowId={(c) => c.id}
        syncUrl
        initialFilters={{ isPublic: 'all', isFeatured: 'all', sortBy: '', sortOrder: '' }}
        errorMessage="Koleksiyonlar yüklenemedi"
      >
        <ResourceList.Header
          title="Koleksiyonlar"
          actions={
            <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
              Yeni Koleksiyon
            </Button>
          }
          tabs={COLLECTION_TABS}
          activeTab={tab}
          onTabChange={setTab}
        />
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Koleksiyon ara..." />
          <ResourceList.FilterSelect name="isPublic" options={PUBLIC_OPTIONS} className="sm:w-44" />
          <ResourceList.FilterSelect name="isFeatured" options={FEATURED_OPTIONS} className="sm:w-40" />
        </ResourceList.Toolbar>
        <ResourceList.Table columns={columns} emptyText="Henüz koleksiyon yok" />
        <ResourceList.Total unit="koleksiyon" />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <CollectionFormModal
          key={modal.collection?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          collection={modal.collection}
        />
      )}
    </>
  );
}
