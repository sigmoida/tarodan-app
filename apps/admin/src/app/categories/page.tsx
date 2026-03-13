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
  ArrowsUpDownIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Image from 'next/image';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children: Array<Category>; // Recursive type
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  collectionCount: number;
  createdAt: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  image: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [flatCategories, setFlatCategories] = useState<Category[]>([]); // For parent select
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    image: '',
    parentId: '',
    sortOrder: 0,
    isActive: true,
  });

  // DnD State
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getCategories();
      // API returns hierarchical structure in response.data.data?
      // Based on service implementation, it returns { data: [...] } where items have children array.
      // But service code also returns flat mapping if included relation?
      // Wait, service returns `categories.map(...)` which includes `children`.
      // So the top level array only contains root categories?
      // Let's check service again.
      // Service: `findMany` has NO `where: { parentId: null }`.
      // So it returns ALL categories.
      // And each category has `children`.
      // This means we get duplicates if we traverse children relation, OR we get simple flat list if we ignore children relation.
      // Actually service `getCategories` does NOT filter by parentId.
      // So we get [Root1, Root2, Child1, Child2].
      // But `children` field is populated.
      // We should filter client side for roots to start rendering tree.

      const distinctCats = response.data.data || [];
      setFlatCategories(distinctCats);

      const roots = distinctCats.filter((c: Category) => !c.parentId);
      // We need to populate children recursively if they are not fully populated in 'children' array
      // But service includes `children` relation.
      // However, `children` array in `findMany` only includes direct children.
      // Since we have all categories in `distinctCats`, we can rebuild the tree or rely on `children`.
      // The `renderCategory` function uses `category.children`.
      // Service `include: { children: ... }` populates direct children.
      // If we iterate roots, we can use `category.children`.
      // BUT `category.children` elements might be missing `children` (grandchildren) if Prisma doesn't include deep.
      // Prisma `include` is not recursive by default.
      // Service code: `include: { children: ... }`. Only 1 level deep?
      // Actually, standard `findMany` gives 1 level.
      // If we want full tree, we might need to build it client side from flat list.

      // Let's build tree from flat list to be safe.
      const buildTree = (cats: Category[]) => {
        const map = new Map<string, Category>();
        cats.forEach(c => map.set(c.id, { ...c, children: [] }));
        const roots: Category[] = [];
        cats.forEach(c => {
          if (c.parentId && map.has(c.parentId)) {
            map.get(c.parentId)!.children.push(map.get(c.id)!);
          } else {
            roots.push(map.get(c.id)!);
          }
        });
        // Sort
        const sortNodes = (nodes: Category[]) => {
          nodes.sort((a, b) => a.sortOrder - b.sortOrder);
          nodes.forEach(n => sortNodes(n.children));
        };
        sortNodes(roots);
        return roots;
      };

      setCategories(buildTree(distinctCats));

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
      image: '',
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
      image: category.image || '',
      parentId: category.parentId || '',
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setShowModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size/type
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB dan küçük olmalı');
      return;
    }

    const toastId = toast.loading('Resim yükleniyor...');
    try {
      // Assuming uploadCategoryImage was added to API
      const res = await adminApi.uploadCategoryImage(file);
      setFormData(prev => ({ ...prev, image: res.data.url }));
      toast.success('Resim yüklendi', { id: toastId });
    } catch (error) {
      toast.error('Resim yüklenemedi', { id: toastId });
    }
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

  // DnD Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires this
    e.dataTransfer.setData('text/plain', id);
    // Add class or style to drag image if needed
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: Category) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetCategory.id) return;

    const sourceId = draggedId;
    setDraggedId(null);

    // Find source category object from flat list
    const sourceCategory = flatCategories.find(c => c.id === sourceId);
    if (!sourceCategory) return;

    // Check if they are siblings (same parent)
    if (sourceCategory.parentId !== targetCategory.parentId) {
      toast.error('Sadece aynı seviyedeki kategorileri sıralayabilirsiniz.');
      return;
    }

    // Swap logic: We want to put Source BEFORE or AFTER Target? 
    // Simplified: Swap sortOrders for now.
    // Better: Assign target's sortOrder to Source, and re-index others? No, that's heavy.
    // Swap is safest for 1-to-1 interaction without bulk update.

    try {
      await Promise.all([
        adminApi.updateCategory(sourceId, { sortOrder: targetCategory.sortOrder }),
        adminApi.updateCategory(targetCategory.id, { sortOrder: sourceCategory.sortOrder })
      ]);
      toast.success('Sıralama güncellendi');
      loadCategories();
    } catch (error) {
      toast.error('Sıralama güncellenemedi');
    }
  };


  const renderCategory = (category: Category, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories.has(category.id);
    const isDragging = draggedId === category.id;

    return (
      <div key={category.id} className="border-b border-gray-200 last:border-b-0">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, category.id)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, category)}
          className={`flex items-center justify-between p-4 hover:bg-gray-100/50 transition-colors cursor-move ${isDragging ? 'opacity-50 bg-gray-100' : ''}`}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="text-gray-600">
              <ArrowsUpDownIcon className="w-4 h-4" />
            </div>
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent drag interference? No, click is fine
                  toggleExpand(category.id);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                )}
              </button>
            ) : (
              <div className="w-7 h-7" /> // Spacer
            )}

            {/* Image Thumbnail */}
            <div className="w-10 h-10 relative bg-gray-100 rounded overflow-hidden flex-shrink-0 border border-gray-300">
              {category.image ? (
                <Image src={category.image} alt={category.name} fill className="object-cover" />
              ) : (
                <PhotoIcon className="w-5 h-5 text-gray-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">{category.name}</span>
                {!category.isActive && (
                  <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-500 rounded">Pasif</span>
                )}
                <span className="text-xs text-gray-500">({category.productCount} ürün, {category.collectionCount} koleksiyon)</span>
              </div>
              {category.description && (
                <p className="text-xs text-gray-500 mt-1 truncate max-w-md">{category.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-gray-600 font-mono mr-2">#{category.sortOrder}</span>
            <button
              onClick={() => openEditModal(category)}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Düzenle"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setDeleteConfirm(category.id)}
              className="p-2 text-red-600 hover:text-red-300 hover:bg-red-50 rounded-lg"
              title="Sil"
              disabled={category.productCount > 0 || hasChildren}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {category.children.map((child) => renderCategory(child, level + 1))}
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
            <h1 className="text-2xl font-bold text-gray-900">Kategoriler</h1>
            <p className="text-gray-500 mt-1">Kategori hiyerarşisi ve yönetimi</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-gray-900 rounded-lg hover:bg-primary-700 transition-colors"
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
              <p className="text-gray-500 mt-4">Yükleniyor...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          {/* Added max-h and overflow for mobile friendliness */}
          <div className="bg-white rounded-xl p-6 max-w-md w-full border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Image Upload */}
              <div className="flex justify-center mb-4">
                <div className="relative w-24 h-24 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden hover:border-primary-500 transition-colors cursor-pointer group">
                  {formData.image ? (
                    <Image src={formData.image} alt="Preview" fill className="object-cover" />
                  ) : (
                    <div className="text-center p-2">
                      <PhotoIcon className="w-8 h-8 text-gray-500 mx-auto mb-1 group-hover:text-primary-600" />
                      <span className="text-[10px] text-gray-500 block">Resim Seç</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Kategori Adı *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-dark w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Açıklama
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-dark w-full"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Üst Kategori
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="input-dark w-full"
                >
                  <option value="">Ana Kategori</option>
                  {flatCategories
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Sıralama (Küçükten büyüğe)
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  className="input-dark w-full"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 bg-gray-100 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-600">
                  Aktif
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-gray-900 rounded-lg hover:bg-primary-700 transition-colors"
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
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Kategoriyi Sil</h3>
            <p className="text-gray-500 mb-6">
              Bu kategoriyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-gray-900 rounded-lg hover:bg-red-700 transition-colors"
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
