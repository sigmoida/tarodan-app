'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  UserIcon,
  ShoppingBagIcon,
  CubeIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';

interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  isSeller: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isBanned: boolean;
  bannedAt?: string;
  bannedReason?: string;
  sellerType?: string;
  companyName?: string;
  taxId?: string;
  membership?: {
    tier: {
      name: string;
      type: string;
    };
    status: string;
  };
  createdAt: string;
  addresses?: Array<{
    id: string;
    title: string;
    fullAddress: string;
    city: string;
    district: string;
  }>;
  stats?: {
    ordersCount: number;
    productsCount: number;
    tradesCount: number;
    messagesCount: number;
  };
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  const loadUser = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getUser(userId);
      setUser(response.data);
    } catch (error: any) {
      console.error('User load error:', error);
      toast.error(error.response?.data?.message || 'Kullanıcı yüklenemedi');
      router.push('/admin/users');
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async () => {
    if (!banReason.trim()) {
      toast.error('Ban nedeni gereklidir');
      return;
    }

    setProcessing(true);
    try {
      await adminApi.banUser(userId, banReason);
      toast.success('Kullanıcı banlandı');
      setShowBanModal(false);
      setBanReason('');
      loadUser();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ban işlemi başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleUnban = async () => {
    setProcessing(true);
    try {
      await adminApi.unbanUser(userId);
      toast.success('Kullanıcı banı kaldırıldı');
      setShowUnbanModal(false);
      loadUser();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unban işlemi başarısız');
    } finally {
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

  if (!user) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Kullanıcı bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin/users"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{user.displayName}</h1>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {user.isBanned ? (
                <span className="px-4 py-2 rounded-full font-medium text-red-600 bg-red-100">
                  Banlı
                </span>
              ) : (
                <span className="px-4 py-2 rounded-full font-medium text-green-600 bg-green-100">
                  Aktif
                </span>
              )}
              {user.isBanned ? (
                <button
                  onClick={() => setShowUnbanModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Banı Kaldır
                </button>
              ) : (
                <button
                  onClick={() => setShowBanModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Banla
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* User Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <UserIcon className="w-5 h-5" />
                  Kullanıcı Bilgileri
                </h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-600 text-sm">Email:</span>
                      <p className="font-medium">{user.email}</p>
                      {user.isEmailVerified ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircleIcon className="w-4 h-4" />
                          Doğrulanmış
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Doğrulanmamış</span>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Telefon:</span>
                      <p className="font-medium">{user.phone || 'Belirtilmemiş'}</p>
                      {user.phone && user.isPhoneVerified ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircleIcon className="w-4 h-4" />
                          Doğrulanmış
                        </span>
                      ) : user.phone ? (
                        <span className="text-xs text-gray-500">Doğrulanmamış</span>
                      ) : null}
                    </div>
                  </div>
                  {user.bio && (
                    <div>
                      <span className="text-gray-600 text-sm">Biyografi:</span>
                      <p className="mt-1">{user.bio}</p>
                    </div>
                  )}
                  {user.isSeller && (
                    <div className="pt-3 border-t">
                      <span className="text-gray-600 text-sm">Satıcı Bilgileri:</span>
                      <div className="mt-2 space-y-2">
                        <p>
                          <span className="font-medium">Tip:</span> {user.sellerType === 'individual' ? 'Bireysel' : 'Kurumsal'}
                        </p>
                        {user.companyName && (
                          <p>
                            <span className="font-medium">Şirket Adı:</span> {user.companyName}
                          </p>
                        )}
                        {user.taxId && (
                          <p>
                            <span className="font-medium">Vergi No:</span> {user.taxId}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {user.isBanned && (
                    <div className="pt-3 border-t">
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">
                          <strong>Ban Nedeni:</strong> {user.bannedReason || 'Belirtilmemiş'}
                        </p>
                        {user.bannedAt && (
                          <p className="text-xs text-red-600 mt-1">
                            Ban Tarihi: {new Date(user.bannedAt).toLocaleString('tr-TR')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="pt-3 border-t">
                    <span className="text-gray-600 text-sm">Kayıt Tarihi:</span>
                    <p className="text-sm">
                      {new Date(user.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Membership Info */}
              {user.membership && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Üyelik Bilgileri</h2>
                  <div className="space-y-2">
                    <p>
                      <span className="text-gray-600">Seviye:</span>{' '}
                      <span className="font-medium">{user.membership.tier.name}</span>
                    </p>
                    <p>
                      <span className="text-gray-600">Durum:</span>{' '}
                      <span className="font-medium">{user.membership.status}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Stats */}
              {user.stats && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">İstatistikler</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <ShoppingBagIcon className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{user.stats.ordersCount || 0}</p>
                      <p className="text-sm text-gray-600">Sipariş</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <CubeIcon className="w-8 h-8 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{user.stats.productsCount || 0}</p>
                      <p className="text-sm text-gray-600">Ürün</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <ArrowPathIcon className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{user.stats.tradesCount || 0}</p>
                      <p className="text-sm text-gray-600">Takas</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <ChatBubbleLeftRightIcon className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold">{user.stats.messagesCount || 0}</p>
                      <p className="text-sm text-gray-600">Mesaj</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Addresses */}
              {user.addresses && user.addresses.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Adresler</h2>
                  <div className="space-y-3">
                    {user.addresses.map((address) => (
                      <div key={address.id} className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-medium">{address.title}</p>
                        <p className="text-sm text-gray-600">{address.fullAddress}</p>
                        <p className="text-sm text-gray-500">
                          {address.district}, {address.city}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Hızlı İşlemler</h3>
                <div className="space-y-2">
                  <Link
                    href={`/admin/orders?userId=${user.id}`}
                    className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Siparişleri Görüntüle
                  </Link>
                  <Link
                    href={`/admin/products?sellerId=${user.id}`}
                    className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Ürünleri Görüntüle
                  </Link>
                  <Link
                    href={`/admin/trades?userId=${user.id}`}
                    className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Takasları Görüntüle
                  </Link>
                </div>
              </div>

              {/* Verification Status */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Doğrulama Durumu</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    {user.isEmailVerified ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Telefon:</span>
                    {user.isPhoneVerified ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Kimlik:</span>
                    {user.isVerified ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Ban Modal */}
        {showBanModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Kullanıcıyı Banla</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ban Nedeni *
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={4}
                  placeholder="Ban nedenini açıklayın..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBanModal(false);
                    setBanReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleBan}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Banla'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unban Modal */}
        {showUnbanModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Banı Kaldır</h3>
              <p className="text-gray-600 mb-6">
                Bu kullanıcının banını kaldırmak istediğinizden emin misiniz?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUnbanModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleUnban}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Banı Kaldır'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
