'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import RichTextEditor from '@/components/RichTextEditor';

interface StaticPage {
  id: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPagesPage() {
  const [pages, setPages] = useState<StaticPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaticPage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: '',
    title: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    isPublished: true,
    sortOrder: 0,
  });

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPages();
      setPages(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Sayfalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      slug: '',
      title: '',
      content: '',
      metaTitle: '',
      metaDescription: '',
      metaKeywords: '',
      isPublished: true,
      sortOrder: 0,
    });
    setShowModal(true);
  };

  const openEdit = async (page: StaticPage) => {
    try {
      const res = await adminApi.getPageById(page.id);
      const p = res.data;
      setForm({
        slug: p.slug,
        title: p.title,
        content: p.content,
        metaTitle: p.metaTitle || '',
        metaDescription: p.metaDescription || '',
        metaKeywords: p.metaKeywords || '',
        isPublished: p.isPublished,
        sortOrder: p.sortOrder ?? 0,
      });
      setEditing(page);
      setShowModal(true);
    } catch (e) {
      toast.error('Sayfa yüklenemedi');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await adminApi.updatePage(editing.id, form);
        toast.success('Sayfa güncellendi');
      } else {
        await adminApi.createPage(form);
        toast.success('Sayfa oluşturuldu');
      }
      setShowModal(false);
      loadPages();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Kaydetme başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deletePage(id);
      toast.success('Sayfa silindi');
      setDeleteConfirm(null);
      loadPages();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Silme başarısız');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Sayfa Yönetimi</h1>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600"
          >
            <PlusIcon className="h-5 w-5" />
            Yeni Sayfa
          </button>
        </div>

        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
          ) : pages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Henüz sayfa yok. &quot;Yeni Sayfa&quot; ile About, FAQ vb. ekleyebilirsiniz.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-dark-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Slug</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Başlık</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">SEO Başlık</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Durum</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {pages.map((p) => (
                    <tr key={p.id} className="text-gray-300">
                      <td className="px-4 py-3 text-sm font-mono">{p.slug}</td>
                      <td className="px-4 py-3 text-sm">{p.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{p.metaTitle || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={p.isPublished ? 'text-green-500' : 'text-gray-500'}>
                          {p.isPublished ? 'Yayında' : 'Taslak'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="text-primary-500 hover:text-primary-400 p-1"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(p.id)}
                          className="text-red-500 hover:text-red-400 p-1 ml-2"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                        {deleteConfirm === p.id && (
                          <span className="ml-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id)}
                              className="text-xs text-red-500 underline"
                            >
                              Sil
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs text-gray-400 ml-2"
                            >
                              İptal
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <h2 className="text-lg font-semibold text-white">
                  {editing ? 'Sayfayı Düzenle' : 'Yeni Sayfa'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Slug *</label>
                  <input
                    type="text"
                    required
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="about, faq, iletisim"
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                    disabled={!!editing}
                  />
                  <p className="text-xs text-gray-500 mt-1">URL: /sayfa/[slug]. Sadece yeni sayfada düzenlenebilir.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Başlık *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">İçerik (WYSIWYG) *</label>
                  <RichTextEditor
                    value={form.content}
                    onChange={(v) => setForm({ ...form, content: v })}
                    placeholder="İçerik yazın..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">SEO Başlık</label>
                    <input
                      type="text"
                      value={form.metaTitle}
                      onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
                      className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Sıra</label>
                    <input
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value, 10) || 0 })}
                      className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">SEO Açıklama</label>
                  <textarea
                    value={form.metaDescription}
                    onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                    rows={2}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">SEO Anahtar Kelimeler</label>
                  <input
                    type="text"
                    value={form.metaKeywords}
                    onChange={(e) => setForm({ ...form, metaKeywords: e.target.value })}
                    className="input-dark w-full rounded-lg px-3 py-2 text-sm"
                    placeholder="kelime1, kelime2"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPublished"
                    checked={form.isPublished}
                    onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                    className="rounded border-dark-600"
                  />
                  <label htmlFor="isPublished" className="text-sm text-gray-300">Yayında</label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-lg bg-dark-700 text-white"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600"
                  >
                    {editing ? 'Güncelle' : 'Oluştur'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
