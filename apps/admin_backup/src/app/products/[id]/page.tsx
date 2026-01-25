'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CubeIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: string;
  status: string;
  category: {
    id: string;
    name: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  images: Array<{
    id: string;
    url: string;
    sortOrder: number;
  }>;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Beklemede', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  active: { label: 'Aktif', color: 'text-green-600', bg: 'bg-green-100' },
  inactive: { label: 'Pasif', color: 'text-gray-600', bg: 'bg-gray-100' },
  rejected: { label: 'Reddedildi', color: 'text-red-600', bg: 'bg-red-100' },
  reserved: { label: 'Rezerve', color: 'text-blue-600', bg: 'bg-blue-100' },
  sold: { label: 'Satıldı', color: 'text-purple-600', bg: 'bg-purple-100' },
};

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getProduct(productId);
      setProduct(response.data);
    } catch (error: any) {
      console.error('Product load error:', error);
      toast.error(error.response?.data?.message || 'Ürün yüklenemedi');
      router.push('/admin/products');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await adminApi.approveProduct(productId, approveNote || undefined);
      toast.success('Ürün onaylandı');
      setShowApproveModal(false);
      setApproveNote('');
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Onay işlemi başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Red nedeni gereklidir');
      return;
    }

    setProcessing(true);
    try {
      await adminApi.rejectProduct(productId, rejectReason);
      toast.success('Ürün reddedildi');
      setShowRejectModal(false);
      setRejectReason('');
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Red işlemi başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    setProcessing(true);
    try {
      await adminApi.deleteProduct(productId);
      toast.success('Ürün silindi');
      router.push('/admin/products');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Yükleniyor...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!product) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Ürün bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = statusConfig[product.status] || statusConfig.pending;
  const canApprove = product.status === 'pending';
  const canReject = product.status === 'pending';
  const canDelete = product.status !== 'sold' && product.status !== 'reserved';

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin/products"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
              <p className="text-sm text-gray-500">Kategori: {product.category.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Images */}
              {product.images && product.images.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <PhotoIcon className="w-5 h-5" />
                    Görseller
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {product.images.map((image) => (
                      <div key={image.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img
                          src={image.url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CubeIcon className="w-5 h-5" />
                  Ürün Bilgileri
                </h2>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 text-sm">Başlık:</span>
                    <p className="font-medium">{product.title}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 text-sm">Açıklama:</span>
                    <p className="mt-1 whitespace-pre-wrap">{product.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div>
                      <span className="text-gray-600 text-sm">Fiyat:</span>
                      <p className="font-semibold text-lg">
                        ₺{product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Durum:</span>
                      <p className="font-medium capitalize">{product.condition}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div>
                      <span className="text-gray-600 text-sm">Görüntülenme:</span>
                      <p className="font-medium">{product.viewCount || 0}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Oluşturulma:</span>
                      <p className="text-sm">
                        {new Date(product.createdAt).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  {product.rejectionReason && (
                    <div className="pt-3 border-t">
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">
                          <strong>Red Nedeni:</strong> {product.rejectionReason}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Seller Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Satıcı Bilgileri</h2>
                <div className="space-y-2">
                  <p>
                    <span className="text-gray-600">İsim:</span>{' '}
                    <Link
                      href={`/admin/users/${product.seller.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {product.seller.displayName}
                    </Link>
                  </p>
                  <p>
                    <span className="text-gray-600">Email:</span> {product.seller.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Actions */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">İşlemler</h3>
                <div className="space-y-2">
                  {canApprove && (
                    <button
                      onClick={() => setShowApproveModal(true)}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                      Onayla
                    </button>
                  )}
                  {canReject && (
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircleIcon className="w-5 h-5" />
                      Reddet
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <TrashIcon className="w-5 h-5" />
                      Sil
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Links */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Hızlı Linkler</h3>
                <div className="space-y-2">
                  <Link
                    href={`/admin/users/${product.seller.id}`}
                    className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Satıcıyı Görüntüle
                  </Link>
                  <Link
                    href={`/admin/orders?productId=${product.id}`}
                    className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Siparişleri Görüntüle
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Approve Modal */}
        {showApproveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ürünü Onayla</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Not (Opsiyonel)
                </label>
                <textarea
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={3}
                  placeholder="Onay notu ekleyin..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setApproveNote('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleApprove}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Onayla'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ürünü Reddet</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Red Nedeni *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={4}
                  placeholder="Red nedenini açıklayın..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Reddet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ürünü Sil</h3>
              <p className="text-gray-600 mb-6">
                Bu ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Sil'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
