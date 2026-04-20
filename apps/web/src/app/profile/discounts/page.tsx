'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  TagIcon,
  CheckIcon,
  XMarkIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ReceiptPercentIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { discountsApi, userApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { StatusBadge, type StatusConfig, Button, Spinner } from '@tarodan/ui';

interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: 'percentage' | 'fixed_amount';
  value: number;
  scope: 'global' | 'category' | 'product' | 'seller';
  targetProductIds: string[];
  minCartValue: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
  remainingUsage: number | null;
}

interface Product {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
  status: string;
}

interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed_amount';
  value: number;
  scope: 'product' | 'seller';
  targetProductIds: string[];
  minCartValue: string;
  maxDiscountAmount: string;
  usageLimitTotal: string;
  usageLimitPerUser: string;
  isStackable: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

const SCOPE_LABELS: Record<string, string> = {
  seller: 'Tüm Mağaza',
  product: 'Seçili Ürünler',
};

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Yüzde (%)',
  fixed_amount: 'Sabit Tutar (TL)',
};

const FILTER_TABS = [
  { value: '', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
  { value: 'expired', label: 'Süresi Dolmuş' },
];

export default function ProfileDiscountsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState<DiscountFormData>({
    code: '',
    name: '',
    description: '',
    type: 'percentage',
    value: 10,
    scope: 'product',
    targetProductIds: [],
    minCartValue: '',
    maxDiscountAmount: '',
    usageLimitTotal: '',
    usageLimitPerUser: '1',
    isStackable: false,
    isActive: true,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast.error('İndirimlerinizi görmek için giriş yapmalısınız');
      router.push('/login?redirect=/profile/discounts');
      return;
    }
    if (!authLoading && !user?.isSeller) {
      toast.error('Bu sayfaya erişim için satıcı olmanız gerekiyor');
      router.push('/profile');
      return;
    }
    if (isAuthenticated && user?.isSeller) {
      fetchDiscounts();
      fetchProducts();
    }
  }, [isAuthenticated, authLoading, user?.isSeller]);

  const fetchDiscounts = async () => {
    setIsLoading(true);
    try {
      const response = await discountsApi.getAll({ limit: 100 });
      const data = response.data;
      let items = data.items || data || [];

      // Filter based on activeFilter
      if (activeFilter === 'active') {
        items = items.filter((d: Discount) => d.isActive && d.isCurrentlyValid);
      } else if (activeFilter === 'inactive') {
        items = items.filter((d: Discount) => !d.isActive);
      } else if (activeFilter === 'expired') {
        items = items.filter((d: Discount) => new Date(d.endDate) < new Date());
      }

      setDiscounts(items);
    } catch (error) {
      console.error('Failed to load discounts:', error);
      toast.error('İndirimler yüklenirken hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await userApi.getMyProducts({ limit: 100, status: 'active' });
      const data = response.data;
      const items = data.data || data.products || data || [];
      setProducts(items.filter((p: Product) => p.status === 'active'));
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.isSeller) {
      fetchDiscounts();
    }
  }, [activeFilter]);

  const openCreateModal = () => {
    setEditingDiscount(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      type: 'percentage',
      value: 10,
      scope: 'seller',
      targetProductIds: [],
      minCartValue: '',
      maxDiscountAmount: '',
      usageLimitTotal: '',
      usageLimitPerUser: '1',
      isStackable: false,
      isActive: true,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const openEditModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code || '',
      name: discount.name,
      description: discount.description || '',
      type: discount.type,
      value: discount.value,
      scope: discount.scope === 'product' ? 'product' : 'seller',
      targetProductIds: discount.targetProductIds || [],
      minCartValue: discount.minCartValue?.toString() || '',
      maxDiscountAmount: discount.maxDiscountAmount?.toString() || '',
      usageLimitTotal: discount.usageLimitTotal?.toString() || '',
      usageLimitPerUser: discount.usageLimitPerUser.toString(),
      isStackable: discount.isStackable,
      isActive: discount.isActive,
      startDate: discount.startDate.split('T')[0],
      endDate: discount.endDate.split('T')[0],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.scope === 'product' && formData.targetProductIds.length === 0) {
      toast.error('Lütfen en az bir ürün seçin');
      return;
    }

    try {
      const data = {
        code: formData.code.trim() || undefined,
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        value: formData.value,
        scope: formData.scope,
        // Tüm mağaza = boş liste; seçili ürünler = seçilen id'ler (API kapsamı buna göre uygular)
        targetProductIds:
          formData.scope === 'product' ? formData.targetProductIds : [],
        minCartValue: formData.minCartValue ? parseFloat(formData.minCartValue) : undefined,
        maxDiscountAmount: formData.maxDiscountAmount ? parseFloat(formData.maxDiscountAmount) : undefined,
        usageLimitTotal: formData.usageLimitTotal ? parseInt(formData.usageLimitTotal) : undefined,
        usageLimitPerUser: parseInt(formData.usageLimitPerUser) || 1,
        isStackable: formData.isStackable,
        isActive: formData.isActive,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate + 'T23:59:59').toISOString(),
      };

      if (editingDiscount) {
        await discountsApi.update(editingDiscount.id, data);
        toast.success('İndirim güncellendi');
      } else {
        await discountsApi.create(data as any);
        toast.success('İndirim oluşturuldu');
      }

      setShowModal(false);
      fetchDiscounts();
    } catch (error: any) {
      console.error('Failed to save discount:', error);
      toast.error(error.response?.data?.message || 'İndirim kaydedilirken hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await discountsApi.delete(id);
      toast.success('İndirim silindi');
      setDeleteConfirm(null);
      fetchDiscounts();
    } catch (error) {
      console.error('Failed to delete discount:', error);
      toast.error('İndirim silinirken hata oluştu');
    }
  };

  const toggleDiscountStatus = async (discount: Discount) => {
    try {
      await discountsApi.update(discount.id, { isActive: !discount.isActive });
      toast.success(discount.isActive ? 'İndirim devre dışı bırakıldı' : 'İndirim aktif edildi');
      fetchDiscounts();
    } catch (error) {
      console.error('Failed to toggle discount status:', error);
      toast.error('Durum güncellenirken hata oluştu');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const discountStatusConfig: Record<string, StatusConfig> = {
    inactive: { label: 'Pasif', variant: 'secondary' },
    active: { label: 'Aktif', variant: 'success' },
    pending: { label: 'Bekliyor', variant: 'warning' },
    expired: { label: 'Süresi Doldu', variant: 'danger' },
    unknown: { label: 'Belirsiz', variant: 'secondary' },
  };

  const getDiscountStatus = (discount: Discount): string => {
    if (!discount.isActive) return 'inactive';
    if (discount.isCurrentlyValid) return 'active';
    const now = new Date();
    if (now < new Date(discount.startDate)) return 'pending';
    if (now > new Date(discount.endDate)) return 'expired';
    return 'unknown';
  };

  const getStatusBadge = (discount: Discount) => {
    const status = getDiscountStatus(discount);
    return <StatusBadge status={status} config={discountStatusConfig} size="sm" />;
  };

  const toggleProductSelection = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      targetProductIds: prev.targetProductIds.includes(productId)
        ? prev.targetProductIds.filter(id => id !== productId)
        : [...prev.targetProductIds, productId],
    }));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="xl" color="border-orange-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/profile" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ReceiptPercentIcon className="w-6 h-6 text-orange-500" />
                  İndirimlerim
                </h1>
              </div>
            </div>
            <Button
              variant="primary"
              size="md"
              className="flex items-center gap-2"
              onClick={openCreateModal}
            >
              <PlusIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Yeni İndirim</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Toplam İndirim</p>
            <p className="text-2xl font-bold text-gray-900">{discounts.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Aktif</p>
            <p className="text-2xl font-bold text-green-600">
              {discounts.filter(d => d.isActive && d.isCurrentlyValid).length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Toplam Kampanya</p>
            <p className="text-2xl font-bold text-blue-600">
              {discounts.length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Toplam Kullanım</p>
            <p className="text-2xl font-bold text-purple-600">
              {discounts.reduce((sum, d) => sum + d.usedCount, 0)}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeFilter === tab.value
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Discount List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="xl" color="border-orange-500 border-t-transparent" />
          </div>
        ) : discounts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <TagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {activeFilter ? 'Bu filtreye uygun indirim yok' : 'Henüz indirim oluşturmadınız'}
            </h3>
            <p className="text-gray-500 mb-6">
              Müşterilerinize özel indirimler ve kampanyalar oluşturun
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={openCreateModal}
            >
              İlk İndirimi Oluştur
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {discounts.map((discount, index) => (
              <motion.div
                key={discount.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Discount Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900 truncate">{discount.name}</h3>
                      {getStatusBadge(discount)}
                    </div>

                    {discount.description && (
                      <p className="text-sm text-gray-500 mb-2 truncate">{discount.description}</p>
                    )}

                    <div className="flex flex-wrap gap-3 text-sm">
                      {/* Value */}
                      <span className="flex items-center gap-1 text-orange-600 font-semibold">
                        {discount.type === 'percentage' ? (
                          <>
                            <ReceiptPercentIcon className="w-4 h-4" />
                            %{discount.value}
                          </>
                        ) : (
                          <>
                            <CurrencyDollarIcon className="w-4 h-4" />
                            {discount.value} TL
                          </>
                        )}
                      </span>

                      {/* Scope */}
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                        {SCOPE_LABELS[discount.scope] || discount.scope}
                      </span>

                      {/* Code */}
                      {discount.code ? (
                        <code className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                          {discount.code}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Otomatik</span>
                      )}

                      {/* Date Range */}
                      <span className="flex items-center gap-1 text-gray-500">
                        <CalendarIcon className="w-4 h-4" />
                        {formatDate(discount.startDate)} - {formatDate(discount.endDate)}
                      </span>

                      {/* Usage */}
                      <span className="text-gray-500">
                        Kullanım: {discount.usedCount}
                        {discount.usageLimitTotal && ` / ${discount.usageLimitTotal}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleDiscountStatus(discount)}
                      className={`p-2 rounded-lg transition-colors ${discount.isActive
                        ? 'text-gray-500 hover:bg-gray-100'
                        : 'text-green-600 hover:bg-green-50'
                        }`}
                      title={discount.isActive ? 'Devre dışı bırak' : 'Aktif et'}
                    >
                      {discount.isActive ? <XMarkIcon className="w-5 h-5" /> : <CheckIcon className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => openEditModal(discount)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Düzenle"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(discount.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Sil"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">
                {editingDiscount ? 'İndirimi Düzenle' : 'Yeni İndirim Oluştur'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Ürünleriniz için indirim kampanyası oluşturun
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    İndirim Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Yaz İndirimi"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Açıklama
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="İndirim açıklaması..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    İndirim Türü *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="percentage">Yüzde (%)</option>
                    <option value="fixed_amount">Sabit Tutar (TL)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Değer *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    max={formData.type === 'percentage' ? 100 : 10000}
                    step={formData.type === 'percentage' ? 1 : 0.01}
                    value={formData.value}
                    onChange={(e) => setFormData(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Product Selection - scope is always 'product' */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Ürün Seçin *
                  </label>
                  {products.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (formData.targetProductIds.length === products.length) {
                          setFormData(prev => ({ ...prev, targetProductIds: [] }));
                        } else {
                          setFormData(prev => ({ ...prev, targetProductIds: products.map(p => p.id) }));
                        }
                      }}
                      className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                    >
                      {formData.targetProductIds.length === products.length ? 'Seçimi Kaldır' : 'Hepsini Seç'}
                    </button>
                  )}
                </div>
                {products.length === 0 ? (
                  <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
                    Aktif ürününüz bulunmuyor
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                    {products.map(product => (
                      <label
                        key={product.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.targetProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                          <p className="text-xs text-gray-500">{getProductEffectivePrice(product).toLocaleString('tr-TR')} TL</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {formData.targetProductIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.targetProductIds.length} ürün seçildi
                  </p>
                )}
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min. Sepet Tutarı (TL)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minCartValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, minCartValue: e.target.value }))}
                    placeholder="Örn: 100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max. İndirim Tutarı (TL)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.maxDiscountAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxDiscountAmount: e.target.value }))}
                    placeholder="Örn: 500"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Toplam Kullanım Limiti
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usageLimitTotal}
                    onChange={(e) => setFormData(prev => ({ ...prev, usageLimitTotal: e.target.value }))}
                    placeholder="Sınırsız"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kullanıcı Başı Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usageLimitPerUser}
                    onChange={(e) => setFormData(prev => ({ ...prev, usageLimitPerUser: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Başlangıç Tarihi *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bitiş Tarihi *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isStackable}
                    onChange={(e) => setFormData(prev => ({ ...prev, isStackable: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700">Kombine edilebilir</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700">Aktif</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setShowModal(false)}
                >
                  İptal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                >
                  {editingDiscount ? 'Güncelle' : 'Oluştur'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-2">İndirimi Sil</h3>
            <p className="text-gray-600 mb-6">
              Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteConfirm(null)}
              >
                İptal
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Sil
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
