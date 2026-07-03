'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { clientListFetcher } from '@/lib/query/client-list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import type { Category } from './_lib/types';
import { categoryColumns } from './_lib/columns';
import { CategoryFormModal } from './_modals/CategoryFormModal';

export default function CategoriesPage() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ category?: Category } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteCategory(id), {
    invalidates: ['categories'],
    successMessage: 'Kategori silindi',
  });

  const onDelete = async (c: Category) => {
    if (
      await confirm({
        title: 'Kategoriyi Sil',
        description: 'Bu kategoriyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        destructive: true,
      })
    )
      del.mutate(c.id);
  };

  const columns = categoryColumns({ onEdit: (c) => setModal({ category: c }), onDelete });

  return (
    <AdminPage>
      <PageHeader title="Kategoriler" description="Kategori listesi ve yönetimi">
        <Button variant="primary" leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setModal({})}>
          Yeni Kategori
        </Button>
      </PageHeader>

      <ResourceList<Category>
        resource="categories"
        fetcher={clientListFetcher(
          () => adminApi.getCategories(),
          (raw) => raw.data ?? [],
          { searchFields: ['name', 'slug', 'description'] },
        )}
        getRowId={(c) => c.id}
        syncUrl
        errorMessage="Kategoriler yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search placeholder="Kategori ara (ad, slug, açıklama)…" />
        </ResourceList.Toolbar>
        <ResourceList.Table columns={columns} emptyText="Henüz kategori yok" />
        <ResourceList.Total unit="kategori" />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <CategoryFormModal
          key={modal.category?.id ?? 'new'}
          open
          onClose={() => setModal(null)}
          category={modal.category}
        />
      )}
    </AdminPage>
  );
}
