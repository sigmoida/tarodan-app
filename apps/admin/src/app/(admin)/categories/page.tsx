'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Checkbox, Input, Spinner, Textarea } from '@tarodan/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children: Array<Category>;
  isActive: boolean;
  productCount: number;
  collectionCount: number;
  createdAt: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  isActive: boolean;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    isActive: true,
  });

  

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getCategories();
      const distinctCats: Category[] = response.data.data || [];
      const sorted = [...distinctCats].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setCategories(sorted);
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      toast.error('Kategoriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      isActive: category.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData, parentId: '' as string };
      if (editingCategory) {
        await adminApi.updateCategory(editingCategory.id, payload);
        toast.success('Kategori güncellendi');
      } else {
        await adminApi.createCategory(payload);
        toast.success('Kategori oluşturuldu');
      }
      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCategory(id);
      toast.success('Kategori silindi');
      setDeleteConfirm(null);
      loadCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
    }
  };

  const renderCategory = (category: Category) => (
    <div key={category.id} className="flex items-center justify-between p-4 hover:bg-surface-alt/50 transition-colors border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-heading truncate">{category.name}</span>
            {!category.isActive && (
              <span className="px-2 py-0.5 text-xs bg-body text-muted rounded">Pasif</span>
            )}
            <span className="text-xs text-muted">({category.productCount} ürün, {category.collectionCount} koleksiyon)</span>
          </div>
          {category.description && (
            <p className="text-xs text-muted mt-1 truncate max-w-md">{category.description}</p>
          )}
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <Button variant="secondary" onClick={() => openEditModal(category)}
          className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
          title="Düzenle">
          <PencilIcon className="h-5 w-5" />
        </Button>
        <Button variant="secondary" onClick={() => setDeleteConfirm(category.id)}
          className="p-2 text-danger-600 hover:text-danger-300 hover:bg-danger-50 rounded-lg"
          title="Sil"
          disabled={category.productCount > 0}>
          <TrashIcon className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-heading">Kategoriler</h1>
            <p className="text-muted mt-1">Kategori listesi ve yönetimi</p>
          </div>
          <Button variant="primary" size="md" onClick={openCreateModal}>
            <PlusIcon className="w-5 h-5" />
            Yeni Kategori
          </Button>
        </div>

        {/* Categories List */}
        <div className="admin-card overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-muted mt-4">Yükleniyor...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-muted">
              Henüz kategori yok
            </div>
          ) : (
            <div>
              {categories.map((category) => renderCategory(category))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50 p-4">
          {/* Added max-h and overflow for mobile friendliness */}
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full border border-border max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-heading mb-4">
              {editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Kategori Adı *
                </label>
                <Input type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Açıklama
                </label>
                <Textarea value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3} />
              </div>

              <div className="pt-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  label="Aktif"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="secondary" size="md" type="button" onClick={() => setShowModal(false)} className="flex-1">
                  İptal
                </Button>
                <Button variant="primary" size="md" type="submit" className="flex-1">
                  {editingCategory ? 'Güncelle' : 'Oluştur'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
            <h3 className="text-lg font-semibold text-heading mb-4">Kategoriyi Sil</h3>
            <p className="text-muted mb-6">
              Bu kategoriyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)} className="flex-1">
                İptal
              </Button>
              <Button variant="danger" size="md" onClick={() => handleDelete(deleteConfirm)} className="flex-1">
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
