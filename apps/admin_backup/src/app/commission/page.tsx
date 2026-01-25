'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface CommissionRule {
  id: string;
  name: string;
  percentage: number;
  type: string;
  sellerType: string | null;
  minAmount: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RuleFormData {
  name: string;
  percentage: number;
  type: string;
  sellerType: string;
  minAmount: string;
  isActive: boolean;
}

const RULE_TYPES = [
  { value: 'default', label: 'Varsayılan' },
  { value: 'category', label: 'Kategori Bazlı' },
  { value: 'seller_type', label: 'Satıcı Tipi Bazlı' },
  { value: 'category_seller', label: 'Kategori + Satıcı' },
];

const SELLER_TYPES = [
  { value: 'individual', label: 'Bireysel' },
  { value: 'verified', label: 'Doğrulanmış' },
  { value: 'platform', label: 'Platform' },
];

export default function CommissionPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    percentage: 5,
    type: 'default',
    sellerType: '',
    minAmount: '',
    isActive: true,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const response = await adminApi.getCommissionRules();
      setRules(response.data.data || response.data || []);
    } catch (error) {
      console.error('Failed to load commission rules:', error);
      toast.error('Komisyon kuralları yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      percentage: 5,
      type: 'default',
      sellerType: '',
      minAmount: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      percentage: rule.percentage,
      type: rule.type,
      sellerType: rule.sellerType || '',
      minAmount: rule.minAmount?.toString() || '',
      isActive: rule.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const data = {
        name: formData.name,
        percentage: formData.percentage / 100, // Convert to decimal
        type: formData.type,
        sellerType: formData.sellerType || undefined,
        minAmount: formData.minAmount ? parseFloat(formData.minAmount) : undefined,
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
      loadRules();
    } catch (error) {
      console.error('Failed to save commission rule:', error);
      toast.error('Komisyon kuralı kaydedilirken hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCommissionRule(id);
      toast.success('Komisyon kuralı silindi');
      setDeleteConfirm(null);
      loadRules();
    } catch (error) {
      console.error('Failed to delete commission rule:', error);
      toast.error('Komisyon kuralı silinirken hata oluştu');
    }
  };

  const toggleRuleStatus = async (rule: CommissionRule) => {
    try {
      await adminApi.updateCommissionRule(rule.id, { isActive: !rule.isActive });
      toast.success(`Kural ${rule.isActive ? 'devre dışı bırakıldı' : 'aktifleştirildi'}`);
      loadRules();
    } catch (error) {
      console.error('Failed to toggle rule status:', error);
      toast.error('Kural durumu güncellenirken hata oluştu');
    }
  };

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
                Komisyon kuralları öncelik sırasına göre değerlendirilir. Bir sipariş için ilk eşleşen kural uygulanır.
                Eşleşme sırası: Kategori + Satıcı Tipi &gt; Kategori &gt; Satıcı Tipi &gt; Varsayılan
              </p>
            </div>
          </div>
        </div>

        {/* Rules Table */}
        <div className="admin-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-dark-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Kural Adı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Tür
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Satıcı Tipi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Komisyon
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Min. Tutar
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
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
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
                        {RULE_TYPES.find((t) => t.value === rule.type)?.label || rule.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-300">
                        {rule.sellerType
                          ? SELLER_TYPES.find((t) => t.value === rule.sellerType)?.label || rule.sellerType
                          : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-primary-400 font-semibold">%{(rule.percentage * 100).toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-300">
                        {rule.minAmount ? `₺${rule.minAmount.toLocaleString()}` : '-'}
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

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-800 rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b border-dark-700">
                <h2 className="text-lg font-semibold text-white">
                  {editingRule ? 'Kuralı Düzenle' : 'Yeni Kural Ekle'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Kural Adı</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Kural Türü</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                  >
                    {RULE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {(formData.type === 'seller_type' || formData.type === 'category_seller') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Satıcı Tipi</label>
                    <select
                      value={formData.sellerType}
                      onChange={(e) => setFormData({ ...formData, sellerType: e.target.value })}
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="">Seçiniz</option>
                      {SELLER_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Komisyon Oranı (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.percentage}
                    onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Minimum Sipariş Tutarı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.minAmount}
                    onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                    placeholder="Opsiyonel"
                  />
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

                <div className="flex justify-end gap-3 pt-4">
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
