'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
}

interface CommissionRule {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  sellerType: 'FREE' | 'PREMIUM' | 'BUSINESS' | 'ALL' | null;
  appliesTo: 'SELLER' | 'BUYER' | 'BOTH';
  sellerRate: number | null;
  buyerRate: number | null;
  sellerMin: number | null;
  sellerMax: number | null;
  buyerMin: number | null;
  buyerMax: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Legacy fields
  percentage?: number;
  type?: string;
  minAmount?: number | null;
}

interface RuleFormData {
  name: string;
  categoryId: string;
  sellerType: 'FREE' | 'PREMIUM' | 'BUSINESS' | 'ALL';
  appliesTo: 'SELLER' | 'BUYER' | 'BOTH';
  sellerRate: string;
  buyerRate: string;
  sellerMin: string;
  sellerMax: string;
  buyerMin: string;
  buyerMax: string;
  isActive: boolean;
}

const SELLER_TYPES = [
  { value: 'FREE', label: 'Ücretsiz' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'BUSINESS', label: 'İşletme' },
  { value: 'ALL', label: 'Tümü' },
];

const APPLIES_TO_OPTIONS = [
  { value: 'SELLER', label: 'Satıcı' },
  { value: 'BUYER', label: 'Alıcı' },
  { value: 'BOTH', label: 'Her İkisi' },
];

export default function CommissionPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    categoryId: '',
    sellerType: 'ALL',
    appliesTo: 'SELLER',
    sellerRate: '5',
    buyerRate: '0',
    sellerMin: '',
    sellerMax: '',
    buyerMin: '',
    buyerMax: '',
    priority: 0,
    isActive: true,
  });
  const [previewPrice, setPreviewPrice] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rulesResponse, categoriesResponse] = await Promise.all([
        adminApi.getCommissionRules(),
        adminApi.getCategories(),
      ]);
      setRules(rulesResponse.data.data || rulesResponse.data || []);
      setCategories(categoriesResponse.data.data || categoriesResponse.data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load data:', error);
      toast.error('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      categoryId: '',
      sellerType: 'ALL',
      appliesTo: 'SELLER',
      sellerRate: '5',
      buyerRate: '0',
      sellerMin: '',
      sellerMax: '',
      buyerMin: '',
      buyerMax: '',
      isActive: true,
    });
    setPreviewPrice('');
    setShowModal(true);
  };

  const openEditModal = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      categoryId: rule.categoryId || '',
      sellerType: rule.sellerType || 'ALL',
      appliesTo: rule.appliesTo || 'SELLER',
      sellerRate: rule.sellerRate?.toString() || '0',
      buyerRate: rule.buyerRate?.toString() || '0',
      sellerMin: rule.sellerMin?.toString() || '',
      sellerMax: rule.sellerMax?.toString() || '',
      buyerMin: rule.buyerMin?.toString() || '',
      buyerMax: rule.buyerMax?.toString() || '',
      isActive: rule.isActive,
    });
    setPreviewPrice('');
    setShowModal(true);
  };

  const calculatePreview = () => {
    if (!previewPrice) return null;
    const price = parseFloat(previewPrice);
    if (isNaN(price) || price <= 0) return null;

    const sellerRate = parseFloat(formData.sellerRate) || 0;
    const buyerRate = parseFloat(formData.buyerRate) || 0;

    let rawSeller = price * (sellerRate / 100);
    let rawBuyer = price * (buyerRate / 100);

    // Apply min/max
    if (formData.sellerMin) {
      rawSeller = Math.max(rawSeller, parseFloat(formData.sellerMin));
    }
    if (formData.sellerMax) {
      rawSeller = Math.min(rawSeller, parseFloat(formData.sellerMax));
    }
    if (formData.buyerMin) {
      rawBuyer = Math.max(rawBuyer, parseFloat(formData.buyerMin));
    }
    if (formData.buyerMax) {
      rawBuyer = Math.min(rawBuyer, parseFloat(formData.buyerMax));
    }

    // Apply appliesTo
    if (formData.appliesTo === 'SELLER') rawBuyer = 0;
    if (formData.appliesTo === 'BUYER') rawSeller = 0;

    return {
      sellerFee: Math.round(rawSeller * 100) / 100,
      buyerFee: Math.round(rawBuyer * 100) / 100,
      total: Math.round((rawSeller + rawBuyer) * 100) / 100,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.appliesTo === 'SELLER' && !formData.sellerRate) {
      toast.error('Satıcı oranı gereklidir');
      return;
    }
    if (formData.appliesTo === 'BUYER' && !formData.buyerRate) {
      toast.error('Alıcı oranı gereklidir');
      return;
    }
    if (formData.appliesTo === 'BOTH' && (!formData.sellerRate || !formData.buyerRate)) {
      toast.error('Hem satıcı hem alıcı oranı gereklidir');
      return;
    }

    if (formData.sellerMin && formData.sellerMax && parseFloat(formData.sellerMin) > parseFloat(formData.sellerMax)) {
      toast.error('Satıcı minimum değeri maksimum değerden büyük olamaz');
      return;
    }
    if (formData.buyerMin && formData.buyerMax && parseFloat(formData.buyerMin) > parseFloat(formData.buyerMax)) {
      toast.error('Alıcı minimum değeri maksimum değerden büyük olamaz');
      return;
    }

    try {
      const data: any = {
        name: formData.name,
        categoryId: formData.categoryId || null,
        sellerType: formData.sellerType,
        appliesTo: formData.appliesTo,
        sellerRate: formData.sellerRate ? parseFloat(formData.sellerRate) : null,
        buyerRate: formData.buyerRate ? parseFloat(formData.buyerRate) : null,
        sellerMin: formData.sellerMin ? parseFloat(formData.sellerMin) : null,
        sellerMax: formData.sellerMax ? parseFloat(formData.sellerMax) : null,
        buyerMin: formData.buyerMin ? parseFloat(formData.buyerMin) : null,
        buyerMax: formData.buyerMax ? parseFloat(formData.buyerMax) : null,
        isActive: formData.isActive,
      };

      if (editingRule) {
        await adminApi.updateCommissionRule(editingRule.id, data);
        toast.success('Komisyon kuralı güncellendi');
      } else {
        await adminApi.createCommissionRule(data);
        toast.success('Komisyon kuralı oluşturuldu');
      }

      setShowModal(false);
      loadData();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to save commission rule:', error);
      toast.error(error.response?.data?.message || 'Komisyon kuralı kaydedilirken hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCommissionRule(id);
      toast.success('Komisyon kuralı silindi');
      setDeleteConfirm(null);
      loadData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to delete commission rule:', error);
      toast.error('Komisyon kuralı silinirken hata oluştu');
    }
  };

  const toggleRuleStatus = async (rule: CommissionRule) => {
    try {
      await adminApi.updateCommissionRule(rule.id, { isActive: !rule.isActive });
      toast.success(`Kural ${rule.isActive ? 'devre dışı bırakıldı' : 'aktifleştirildi'}`);
      loadData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to toggle rule status:', error);
      toast.error('Kural durumu güncellenirken hata oluştu');
    }
  };

  const preview = calculatePreview();

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Komisyon Yönetimi</h1>
            <p className="text-gray-400 mt-1">Platform komisyon oranlarını yönetin</p>
          </div>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <PlusIcon className="h-5 w-5" />
            Yeni Kural Ekle
          </button>
        </div>

        {/* Info Box */}
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-blue-400 font-medium">Komisyon Hesaplama</h4>
              <p className="text-gray-400 text-sm mt-1">
                Komisyon kuralları eşleşme sırasına göre değerlendirilir. Bir sipariş için ilk eşleşen kural uygulanır.
                Eşleşme sırası: Kategori + Satıcı Tipi &gt; Kategori + Tümü &gt; Satıcı Tipi &gt; Varsayılan (Tümü + Tümü)
                Aynı kombinasyon (kategori + satıcı tipi) için sadece bir kural oluşturulabilir.
              </p>
            </div>
          </div>
        </div>

        {/* Rules Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Kural Adı
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Satıcı Tipi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Uygulanan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Satıcı Oranı
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Alıcı Oranı
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Durum
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      Henüz komisyon kuralı eklenmemiş
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-dark-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-white font-medium">{rule.name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-300">
                          {rule.categoryName || 'Tümü'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-300">
                          {SELLER_TYPES.find((t) => t.value === rule.sellerType)?.label || rule.sellerType || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-300">
                          {APPLIES_TO_OPTIONS.find((t) => t.value === rule.appliesTo)?.label || rule.appliesTo}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-primary-400 font-semibold">
                          {rule.sellerRate !== null ? `%${rule.sellerRate.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-primary-400 font-semibold">
                          {rule.buyerRate !== null ? `%${rule.buyerRate.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleRuleStatus(rule)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rule.isActive
                              ? 'bg-green-900/50 text-green-400 border border-green-700'
                              : 'bg-gray-900/50 text-gray-400 border border-gray-700'
                          }`}
                        >
                          {rule.isActive ? 'Aktif' : 'Pasif'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => openEditModal(rule)}
                          className="text-gray-400 hover:text-white p-2"
                          title="Düzenle"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(rule.id)}
                          className="text-gray-400 hover:text-red-400 p-2"
                          title="Sil"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-dark-800 rounded-lg w-full max-w-2xl my-8">
              <div className="flex items-center justify-between p-6 border-b border-dark-700">
                <h2 className="text-lg font-semibold text-white">
                  {editingRule ? 'Kuralı Düzenle' : 'Yeni Kural Ekle'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Kural Adı *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Kategori</label>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="">Tüm Kategoriler</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Satıcı Tipi *</label>
                    <select
                      value={formData.sellerType}
                      onChange={(e) => setFormData({ ...formData, sellerType: e.target.value as any })}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                      required
                    >
                      {SELLER_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Komisyon Uygulanan *</label>
                  <div className="flex gap-4">
                    {APPLIES_TO_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="appliesTo"
                          value={option.value}
                          checked={formData.appliesTo === option.value}
                          onChange={(e) => setFormData({ ...formData, appliesTo: e.target.value as any })}
                          className="text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-gray-300">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Seller Fields */}
                {(formData.appliesTo === 'SELLER' || formData.appliesTo === 'BOTH') && (
                  <div className="border border-dark-600 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-medium text-gray-300">Satıcı Komisyonu</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          Satıcı Oranı (%) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={formData.sellerRate}
                          onChange={(e) => setFormData({ ...formData, sellerRate: e.target.value })}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                          required={formData.appliesTo === 'SELLER' || formData.appliesTo === 'BOTH'}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          Satıcı Minimum (₺)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.sellerMin}
                          onChange={(e) => setFormData({ ...formData, sellerMin: e.target.value })}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                          placeholder="Opsiyonel"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          Satıcı Maksimum (₺)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.sellerMax}
                          onChange={(e) => setFormData({ ...formData, sellerMax: e.target.value })}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                          placeholder="Opsiyonel"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Buyer Fields */}
                {(formData.appliesTo === 'BUYER' || formData.appliesTo === 'BOTH') && (
                  <div className="border border-dark-600 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-medium text-gray-300">Alıcı Komisyonu</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">
                        Alıcı Oranı (%) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.buyerRate}
                        onChange={(e) => setFormData({ ...formData, buyerRate: e.target.value })}
                        className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                        required={formData.appliesTo === 'BUYER' || formData.appliesTo === 'BOTH'}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          Alıcı Minimum (₺)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.buyerMin}
                          onChange={(e) => setFormData({ ...formData, buyerMin: e.target.value })}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                          placeholder="Opsiyonel"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          Alıcı Maksimum (₺)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.buyerMax}
                          onChange={(e) => setFormData({ ...formData, buyerMax: e.target.value })}
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                          placeholder="Opsiyonel"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Calculator */}
                <div className="border border-dark-600 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-medium text-gray-300">Önizleme Hesaplayıcı</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Örnek Ürün Fiyatı (₺)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={previewPrice}
                      onChange={(e) => setPreviewPrice(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                      placeholder="1000"
                    />
                  </div>
                  {preview && (
                    <div className="bg-dark-700 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Satıcı Komisyonu:</span>
                        <span className="text-white font-medium">₺{preview.sellerFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Alıcı Komisyonu:</span>
                        <span className="text-white font-medium">₺{preview.buyerFee.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-dark-600 pt-2 flex justify-between">
                        <span className="text-gray-300 font-medium">Toplam Komisyon:</span>
                        <span className="text-primary-400 font-bold">₺{preview.total.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-dark-600 text-primary-500 focus:ring-primary-500 bg-dark-700"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-400">
                    Kural aktif
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-dark-700">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                    İptal
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingRule ? 'Güncelle' : 'Oluştur'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-800 rounded-lg w-full max-w-sm p-6">
              <div className="flex items-center gap-3 text-red-400 mb-4">
                <ExclamationTriangleIcon className="h-6 w-6" />
                <h3 className="text-lg font-semibold">Kuralı Sil</h3>
              </div>
              <p className="text-gray-400 mb-6">
                Bu komisyon kuralını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">
                  İptal
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Sil
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
