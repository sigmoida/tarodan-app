'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children: Array<{ id: string; name: string; slug: string }>;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    parentId: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getCategories();
      setCategories(response.data.data || response.data || []);
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      toast.error(error.response?.data?.message || 'Kategoriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      parentId: '',
      sortOrder: 0,
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      parentId: category.parentId || '',
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await adminApi.updateCategory(editingCategory.id, formData);
        toast.success('Kategori güncellendi');
      } else {
        await adminApi.createCategory(formData);
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

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const renderCategory = (category: Category, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories.has(category.id);

    return (
      <div key={category.id} className="border-b border-dark-700 last:border-b-0">
        <div
          className="flex items-center justify-between p-4 hover:bg-dark-700/50 transition-colors"
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <div className="flex items-center gap-3 flex-1">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(category.id)}
                className="p-1 hover:bg-dark-600 rounded"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                )}
              </button>
            ) : (
              <div className="w-7" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{category.name}</span>
                {!category.isActive && (
                  <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">Pasif</span>
                )}
                <span className="text-sm text-gray-400">({category.productCount} ürün)</span>
              </div>
              {category.description && (
                <p className="text-sm text-gray-500 mt-1">{category.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openEditModal(category)}
                className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                title="Düzenle"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setDeleteConfirm(category.id)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg"
                title="Sil"
                disabled={category.productCount > 0 || (category.children && category.children.length > 0)}
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {category.children.map((child) => {
              const fullChild = categories.find((c) => c.id === child.id);
              if (!fullChild) return null;
              return renderCategory(fullChild, level + 1);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Kategoriler</h1>
            <p className="text-gray-400 mt-1">Kategori yönetimi</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Yeni Kategori
          </button>
        </div>

        {/* Categories List */}
        <div className="admin-card overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Yükleniyor...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              Henüz kategori yok
            </div>
          ) : (
            <div>
              {categories.filter((c) => !c.parentId).map((category) => renderCategory(category))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 max-w-md w-full mx-4 border border-dark-700">
            <h2 className="text-xl font-semibold text-white mb-4">
              {editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Kategori Adı *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="admin-input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Açıklama
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="admin-input w-full"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Üst Kategori
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="admin-input w-full"
                >
                  <option value="">Ana Kategori</option>
                  {categories
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sıralama
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  className="admin-input w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-dark-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-300">
                  Aktif
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {editingCategory ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 max-w-md w-full mx-4 border border-dark-700">
            <h3 className="text-lg font-semibold text-white mb-4">Kategoriyi Sil</h3>
            <p className="text-gray-400 mb-6">
              Bu kategoriyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
