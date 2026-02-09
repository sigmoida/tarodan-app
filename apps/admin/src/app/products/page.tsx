'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import Image from 'next/image';
import {
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: 'pending' | 'active' | 'rejected' | 'sold' | 'inactive';
  condition: string;
  seller: {
    id: string;
    displayName: string;
  };
  category: {
    name: string;
  };
  imageUrl?: string;
  createdAt: string;
}

interface User {
  id: string;
  displayName: string;
  email: string;
}

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSellerId = useMemo(() => searchParams.get('sellerId') || '', [searchParams]);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Seller filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>(urlSellerId);
  const [sellerSearch, setSellerSearch] = useState('');
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users for dropdown
  const loadUsers = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    try {
      const response = await adminApi.getUsers({ search: searchTerm, limit: 10, isSeller: true });
      const data = response.data.data || response.data.users || [];
      setUsers(data.map((u: any) => ({ id: u.id, displayName: u.displayName, email: u.email })));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Load users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Debounce seller search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sellerSearch) loadUsers(sellerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [sellerSearch, loadUsers]);

  // Sync URL sellerId with state
  useEffect(() => {
    setSelectedSellerId(urlSellerId);
  }, [urlSellerId]);

  const handleSelectSeller = (user: User) => {
    setSelectedSellerId(user.id);
    setSellerSearch(user.displayName);
    setShowSellerDropdown(false);
    router.push(`/products?sellerId=${user.id}`);
  };

  const clearSellerFilter = () => {
    setSelectedSellerId('');
    setSellerSearch('');
    router.push('/products');
  };

  useEffect(() => {
    loadProducts();
  }, [page, filter, selectedSellerId]);

  const loadProducts = async (pageOverride?: number) => {
    const currentPage = pageOverride ?? page;
    setLoading(true);
    try {
      const response = await adminApi.getProducts({
        page: currentPage,
        limit: 20,
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        sellerId: selectedSellerId || undefined,
      });
      const data = response.data.data || response.data.products || [];
      const meta = response.data.meta || {};
      if (pageOverride !== undefined) setPage(pageOverride);
      const mappedProducts = data.map((p: any) => ({
        id: p.id,
        title: p.title,
        price: Number(p.price),
        originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
        salePrice: p.salePrice != null ? Number(p.salePrice) : null,
        isOnSale: p.isOnSale,
        status: p.status,
        condition: p.condition,
        seller: p.seller || { id: p.sellerId, displayName: 'Satıcı' },
        category: p.category || { name: 'Kategori' },
        imageUrl: p.imageUrl || p.images?.[0]?.url || p.images?.[0] || 'https://placehold.co/100x100/1a1a2e/666?text=Ürün',
        createdAt: p.createdAt,
      }));
      setProducts(mappedProducts);
      setTotal(meta.total || data.length);
      setPendingCount(mappedProducts.filter((p: Product) => p.status === 'pending').length);
      setSelectedIds(new Set()); // Clear selection on page change
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Products load error:', error);
      toast.error('Ürünler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (productId: string) => {
    try {
      const response = await adminApi.approveProduct(productId);
      toast.success('Ürün onaylandı');
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Approve error:', error);

      // Better error handling
      let errorMessage = 'İşlem başarısız';

      if (error.response) {
        // Server responded with error
        errorMessage = error.response.data?.message || error.response.data?.error || `Sunucu hatası: ${error.response.status}`;
      } else if (error.request) {
        // Request made but no response
        errorMessage = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
      } else {
        // Error in request setup
        errorMessage = error.message || 'Bir hata oluştu';
      }

      toast.error(errorMessage);
    }
  };

  const handleReject = async (productId: string) => {
    const reason = prompt('Reddetme sebebi:');
    if (!reason) return;

    try {
      await adminApi.rejectProduct(productId, reason);
      toast.success('Ürün reddedildi');
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Reject error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'İşlem başarısız';
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;

    try {
      await adminApi.deleteProduct(productId);
      toast.success('Ürün silindi');
      loadProducts();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Selection handlers
  const toggleSelect = (productId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const pendingProducts = filteredProducts.filter(p => p.status === 'pending');
    if (selectedIds.size === pendingProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingProducts.map(p => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) {
      toast.error('En az bir ürün seçin');
      return;
    }

    setBulkProcessing(true);
    try {
      const result = await adminApi.bulkApproveProducts(Array.from(selectedIds));
      toast.success(result.data.message || `${selectedIds.size} ürün onaylandı`);
      setSelectedIds(new Set());
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Bulk approve error:', error);
      toast.error(error.response?.data?.message || 'Toplu onaylama başarısız');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) {
      toast.error('En az bir ürün seçin');
      return;
    }

    const reason = prompt('Toplu reddetme sebebi:');
    if (!reason) return;

    setBulkProcessing(true);
    try {
      const result = await adminApi.bulkRejectProducts(Array.from(selectedIds), reason);
      toast.success(result.data.message || `${selectedIds.size} ürün reddedildi`);
      setSelectedIds(new Set());
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Bulk reject error:', error);
      toast.error(error.response?.data?.message || 'Toplu reddetme başarısız');
    } finally {
      setBulkProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'badge-warning',
      active: 'badge-success',
      rejected: 'badge-danger',
      sold: 'badge-info',
      inactive: 'badge-gray',
    };
    const labels: Record<string, string> = {
      pending: 'Onay Bekliyor',
      active: 'Aktif',
      rejected: 'Reddedildi',
      sold: 'Satıldı',
      inactive: 'Silindi',
    };
    return <span className={`badge ${badges[status] || 'badge-gray'}`}>{labels[status] || status}</span>;
  };

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      mint: 'Mint',
      near_mint: 'Near Mint',
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      poor: 'Poor',
    };
    return labels[condition] || condition;
  };

  const filteredProducts = products.filter((product) => {
    if (search && !product.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter !== 'all' && product.status !== filter) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Ürünler</h1>
              <p className="text-gray-400 mt-1">
                {filter === 'pending'
                  ? `${products.filter((p) => p.status === 'pending').length} ürün onay bekliyor`
                  : `Toplam ${total} ürün`}
                {selectedSellerId && (
                  <span className="ml-2">
                    — Satıcıya göre filtreleniyor
                    <button onClick={clearSellerFilter} className="ml-2 text-primary-500 hover:underline">Filtreyi kaldır</button>
                  </span>
                )}
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
                {pendingCount} Bekleyen
              </span>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                {selectedIds.size} ürün seçili
              </span>
              <button
                onClick={handleBulkApprove}
                disabled={bulkProcessing}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Seçilenleri Onayla
              </button>
              <button
                onClick={handleBulkReject}
                disabled={bulkProcessing}
                className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                <XCircleIcon className="h-4 w-4" />
                Seçilenleri Reddet
              </button>
            </div>
          )}
          <button
            onClick={async () => {
              try {
                const res = await adminApi.exportProducts({ status: filter === 'all' ? undefined : filter, sellerId: selectedSellerId || undefined });
                const blob = new Blob([res.data], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
              } catch (e) { console.error(e); }
            }}
            className="px-3 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm"
          >
            CSV İndir
          </button>
        </div>


        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 flex gap-2">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Ürün ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProducts(1)}
              className="admin-input pl-10 flex-1"
            />
            <button type="button" onClick={() => loadProducts(1)} className="btn-primary whitespace-nowrap">
              Ara
            </button>
          </div>

          {/* Seller Filter */}
          <div className="relative w-full sm:w-64">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Satıcı ara..."
              value={sellerSearch}
              onChange={(e) => {
                setSellerSearch(e.target.value);
                setShowSellerDropdown(true);
              }}
              onFocus={() => setShowSellerDropdown(true)}
              className="admin-input pl-10 pr-10"
            />
            {selectedSellerId && (
              <button
                onClick={clearSellerFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            )}

            {showSellerDropdown && sellerSearch.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-dark-700 border border-dark-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {loadingUsers ? (
                  <div className="p-3 text-center text-gray-400">Aranıyor...</div>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectSeller(user)}
                      className="w-full px-4 py-2 text-left hover:bg-dark-600 text-white"
                    >
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-400">Satıcı bulunamadı</div>
                )}
              </div>
            )}
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="admin-input w-full sm:w-48"
          >
            <option value="all">Tüm Ürünler</option>
            <option value="pending">Onay Bekleyenler</option>
            <option value="active">Aktif</option>
            <option value="rejected">Reddedilenler</option>
            <option value="sold">Satılanlar</option>
            <option value="inactive">Silindi</option>
          </select>
        </div>

        {/* Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredProducts.filter(p => p.status === 'pending').length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                      title="Tümünü seç (bekleyenler)"
                    />
                  </th>
                  <th>Ürün</th>
                  <th>Fiyat</th>
                  <th>Durum</th>
                  <th>Kondisyon</th>
                  <th>Satıcı</th>
                  <th>Kategori</th>
                  <th>Tarih</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      Ürün bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className={selectedIds.has(product.id) ? 'bg-primary-500/5' : ''}>
                      <td>
                        {product.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="rounded border-gray-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                          />
                        )}
                      </td>
                      <td>
                        <div className="flex items-center">
                          <div className="w-12 h-12 bg-dark-700 rounded-lg overflow-hidden mr-3 flex-shrink-0">
                            <Image
                              src={product.imageUrl || 'https://placehold.co/100x100/1a1a2e/666?text=Ürün'}
                              alt={product.title}
                              width={48}
                              height={48}
                              className="object-cover w-full h-full"
                              unoptimized
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/1a1a2e/666?text=Ürün';
                              }}
                            />
                          </div>
                          <span className="font-medium text-white line-clamp-2">
                            {product.title}
                          </span>
                        </div>
                      </td>
                      <td className="font-medium text-primary-400">
                        {isProductOnSaleDisplay(product) && (
                          <span className="text-gray-400 line-through text-sm block">
                            ₺{getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR')}
                          </span>
                        )}
                        ₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}
                      </td>
                      <td>{getStatusBadge(product.status)}</td>
                      <td>
                        <span className="text-gray-300">
                          {getConditionLabel(product.condition)}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/users/${product.seller.id}`}
                          className="text-white hover:text-primary-500"
                        >
                          {product.seller.displayName}
                        </Link>
                      </td>
                      <td>{product.category.name}</td>
                      <td>
                        {new Date(product.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/products/${product.id}`}
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          {product.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(product.id)}
                                className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg"
                                title="Onayla"
                              >
                                <CheckIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleReject(product.id)}
                                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                                title="Reddet"
                              >
                                <XMarkIcon className="h-5 w-5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                            title="Sil"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Sayfa {page} / {Math.ceil(total / 20)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="btn-secondary disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
