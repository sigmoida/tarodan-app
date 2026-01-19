'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import Image from 'next/image';
import {
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  title: string;
  price: number;
  status: 'pending' | 'active' | 'rejected' | 'sold';
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

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadProducts();
  }, [page, filter]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getProducts({
        page,
        limit: 20,
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
      });
      const data = response.data.data || response.data.products || [];
      const meta = response.data.meta || {};
      setProducts(data.map((p: any) => ({
        id: p.id,
        title: p.title,
        price: Number(p.price),
        status: p.status,
        condition: p.condition,
        seller: p.seller || { id: p.sellerId, displayName: 'Satıcı' },
        category: p.category || { name: 'Kategori' },
        imageUrl: p.imageUrl || p.images?.[0]?.url || p.images?.[0] || 'https://placehold.co/100x100/1a1a2e/666?text=Ürün',
        createdAt: p.createdAt,
      })));
      setTotal(meta.total || data.length);
    } catch (error) {
      console.error('Products load error:', error);
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
      console.error('Approve error:', error);
      
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
      console.error('Reject error:', error);
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

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'badge-warning',
      active: 'badge-success',
      rejected: 'badge-danger',
      sold: 'badge-info',
    };
    const labels: Record<string, string> = {
      pending: 'Onay Bekliyor',
      active: 'Aktif',
      rejected: 'Reddedildi',
      sold: 'Satıldı',
    };
    return <span className={`badge ${badges[status]}`}>{labels[status]}</span>;
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
          <div>
            <h1 className="text-2xl font-bold text-white">Ürünler</h1>
            <p className="text-gray-400 mt-1">
              {filter === 'pending'
                ? `${products.filter((p) => p.status === 'pending').length} ürün onay bekliyor`
                : `Toplam ${total} ürün`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Ürün ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-input pl-10"
            />
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
          </select>
        </div>

        {/* Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
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
                    <td colSpan={8} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      Ürün bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id}>
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
                        ₺{product.price.toLocaleString()}
                      </td>
                      <td>{getStatusBadge(product.status)}</td>
                      <td>
                        <span className="text-gray-300">
                          {getConditionLabel(product.condition)}
                        </span>
                      </td>
                      <td>{product.seller.displayName}</td>
                      <td>{product.category.name}</td>
                      <td>
                        {new Date(product.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
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
