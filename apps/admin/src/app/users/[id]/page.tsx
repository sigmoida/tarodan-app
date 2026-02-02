'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeftIcon,
  UserIcon,
  ShoppingBagIcon,
  CubeIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  StarIcon,
  MapPinIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: string;
  createdAt: string;
  imageUrl?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
  role: 'buyer' | 'seller';
  otherParty: { id: string; displayName: string };
  product?: { id: string; title: string };
}

interface Trade {
  id: string;
  tradeNumber?: string;
  status: string;
  createdAt: string;
  role: 'initiator' | 'receiver';
  cashAmount?: number;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems: Array<{ product: { id: string; title: string } }>;
  receiverItems: Array<{ product: { id: string; title: string } }>;
}

interface Rating {
  id: string;
  score: number;
  comment?: string;
  createdAt: string;
  giver?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
}

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
    startDate: string;
    endDate?: string;
  };
  createdAt: string;
  lastLoginAt?: string;
  lastActivityAt?: string;
  averageRating?: number;
  addresses?: Array<{
    id: string;
    title: string;
    fullAddress: string;
    city: string;
    district: string;
    postalCode?: string;
    isDefault: boolean;
  }>;
  products?: Product[];
  recentOrders?: Order[];
  recentTrades?: Trade[];
  givenRatings?: Rating[];
  receivedRatings?: Rating[];
  stats?: {
    productsCount: number;
    ordersCount: number;
    buyerOrdersCount: number;
    sellerOrdersCount: number;
    tradesCount: number;
    initiatedTradesCount: number;
    receivedTradesCount: number;
    messagesCount: number;
    sentMessagesCount: number;
    receivedMessagesCount: number;
    givenRatingsCount: number;
    receivedRatingsCount: number;
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
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'trades' | 'ratings'>('orders');

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
      if (process.env.NODE_ENV === 'development') console.error('User load error:', error);
      toast.error(error.response?.data?.message || 'Kullanıcı yüklenemedi');
      router.push('/users');
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

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      pending_payment: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-blue-100 text-blue-800',
      preparing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      sold: 'bg-purple-100 text-purple-800',
      accepted: 'bg-blue-100 text-blue-800',
      both_shipped: 'bg-indigo-100 text-indigo-800',
      disputed: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      pending: 'Bekliyor',
      pending_payment: 'Ödeme Bekliyor',
      paid: 'Ödendi',
      preparing: 'Hazırlanıyor',
      shipped: 'Kargoda',
      delivered: 'Teslim Edildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
      rejected: 'Reddedildi',
      active: 'Aktif',
      inactive: 'Pasif',
      sold: 'Satıldı',
      accepted: 'Kabul Edildi',
      both_shipped: 'Gönderildi',
      disputed: 'İtirazlı',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-400">Yükleniyor...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-400">Kullanıcı bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/users"
            className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-400" />
          </Link>
          <div className="flex-1 flex items-center gap-4">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.displayName}
                width={64}
                height={64}
                className="rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-500">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{user.displayName}</h1>
              <p className="text-gray-400">{user.email}</p>
              {user.averageRating && (
                <div className="flex items-center gap-1 mt-1">
                  <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  <span className="text-yellow-500 font-medium">{user.averageRating}</span>
                  <span className="text-gray-500 text-sm">({user.stats?.receivedRatingsCount || 0} değerlendirme)</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user.isBanned ? (
              <>
                <span className="px-4 py-2 rounded-full font-medium text-red-400 bg-red-500/20">
                  Banlı
                </span>
                <button
                  onClick={() => setShowUnbanModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Banı Kaldır
                </button>
              </>
            ) : (
              <>
                <span className="px-4 py-2 rounded-full font-medium text-green-400 bg-green-500/20">
                  Aktif
                </span>
                <button
                  onClick={() => setShowBanModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Banla
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        {user.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="admin-card p-4 text-center">
              <ShoppingBagIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.ordersCount}</p>
              <p className="text-xs text-gray-400">Toplam Sipariş</p>
              <p className="text-xs text-gray-500">
                {user.stats.buyerOrdersCount} alıcı / {user.stats.sellerOrdersCount} satıcı
              </p>
            </div>
            <div className="admin-card p-4 text-center">
              <CubeIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.productsCount}</p>
              <p className="text-xs text-gray-400">Ürün</p>
            </div>
            <div className="admin-card p-4 text-center">
              <ArrowPathIcon className="w-8 h-8 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.tradesCount}</p>
              <p className="text-xs text-gray-400">Takas</p>
              <p className="text-xs text-gray-500">
                {user.stats.initiatedTradesCount} başlatan / {user.stats.receivedTradesCount} alıcı
              </p>
            </div>
            <div className="admin-card p-4 text-center">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.messagesCount}</p>
              <p className="text-xs text-gray-400">Mesaj</p>
              <p className="text-xs text-gray-500">
                {user.stats.sentMessagesCount} gönderilen / {user.stats.receivedMessagesCount} alınan
              </p>
            </div>
            <div className="admin-card p-4 text-center">
              <StarIcon className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.receivedRatingsCount}</p>
              <p className="text-xs text-gray-400">Alınan Değerlendirme</p>
            </div>
            <div className="admin-card p-4 text-center">
              <StarIcon className="w-8 h-8 text-cyan-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{user.stats.givenRatingsCount}</p>
              <p className="text-xs text-gray-400">Verilen Değerlendirme</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* User Info Card */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <UserIcon className="w-5 h-5" />
                Kullanıcı Bilgileri
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-gray-400 text-sm">Email</p>
                  <p className="text-white font-medium">{user.email}</p>
                  {user.isEmailVerified ? (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" /> Doğrulanmış
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Doğrulanmamış</span>
                  )}
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Telefon</p>
                  <p className="text-white font-medium">{user.phone || 'Belirtilmemiş'}</p>
                  {user.phone && (
                    user.isPhoneVerified ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircleIcon className="w-3 h-3" /> Doğrulanmış
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Doğrulanmamış</span>
                    )
                  )}
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Kayıt Tarihi</p>
                  <p className="text-white">{new Date(user.createdAt).toLocaleDateString('tr-TR')}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Son Giriş</p>
                  <p className="text-white">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('tr-TR') : 'Hiç giriş yapmadı'}
                  </p>
                </div>
                {user.bio && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-sm">Biyografi</p>
                    <p className="text-white">{user.bio}</p>
                  </div>
                )}
              </div>

              {/* Seller Info */}
              {user.isSeller && (
                <div className="mt-6 pt-6 border-t border-dark-600">
                  <h3 className="text-md font-semibold text-white mb-3">Satıcı Bilgileri</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400 text-sm">Satıcı Tipi</p>
                      <p className="text-white">{user.sellerType === 'individual' ? 'Bireysel' : 'Kurumsal'}</p>
                    </div>
                    {user.companyName && (
                      <div>
                        <p className="text-gray-400 text-sm">Şirket Adı</p>
                        <p className="text-white">{user.companyName}</p>
                      </div>
                    )}
                    {user.taxId && (
                      <div>
                        <p className="text-gray-400 text-sm">Vergi No</p>
                        <p className="text-white">{user.taxId}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ban Info */}
              {user.isBanned && (
                <div className="mt-6 pt-6 border-t border-dark-600">
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 font-medium">Ban Nedeni</p>
                    <p className="text-white mt-1">{user.bannedReason || 'Belirtilmemiş'}</p>
                    {user.bannedAt && (
                      <p className="text-red-400 text-sm mt-2">
                        Ban Tarihi: {new Date(user.bannedAt).toLocaleString('tr-TR')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Membership Info */}
            {user.membership && (
              <div className="admin-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Üyelik Bilgileri</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Üyelik Seviyesi</p>
                    <p className="text-white font-medium">{user.membership.tier.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Durum</p>
                    <p className="text-white">{user.membership.status}</p>
                  </div>
                  {user.membership.startDate && (
                    <div>
                      <p className="text-gray-400 text-sm">Başlangıç</p>
                      <p className="text-white">{new Date(user.membership.startDate).toLocaleDateString('tr-TR')}</p>
                    </div>
                  )}
                  {user.membership.endDate && (
                    <div>
                      <p className="text-gray-400 text-sm">Bitiş</p>
                      <p className="text-white">{new Date(user.membership.endDate).toLocaleDateString('tr-TR')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tabs for Orders, Products, Trades, Ratings */}
            <div className="admin-card">
              <div className="border-b border-dark-600">
                <div className="flex">
                  {[
                    { key: 'orders', label: 'Siparişler', count: user.recentOrders?.length || 0 },
                    { key: 'products', label: 'Ürünler', count: user.products?.length || 0 },
                    { key: 'trades', label: 'Takaslar', count: user.recentTrades?.length || 0 },
                    { key: 'ratings', label: 'Değerlendirmeler', count: (user.receivedRatings?.length || 0) },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`px-6 py-4 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'text-primary-500 border-b-2 border-primary-500'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {/* Orders Tab */}
                {activeTab === 'orders' && (
                  <div className="space-y-3">
                    {user.recentOrders && user.recentOrders.length > 0 ? (
                      <>
                        {user.recentOrders.map((order) => (
                          <div key={order.id} className="flex items-center justify-between p-4 bg-dark-700 rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  order.role === 'buyer' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                                }`}>
                                  {order.role === 'buyer' ? 'Alıcı' : 'Satıcı'}
                                </span>
                                <Link href={`/orders/${order.id}`} className="text-white font-medium hover:text-primary-500">
                                  {order.orderNumber || `#${order.id.slice(0, 8)}`}
                                </Link>
                                {getStatusBadge(order.status)}
                              </div>
                              <p className="text-sm text-gray-400 mt-1">
                                {order.role === 'buyer' ? 'Satıcı' : 'Alıcı'}: {order.otherParty?.displayName || 'Bilinmiyor'}
                                {order.product && ` • ${order.product.title}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-white font-medium">₺{order.totalAmount.toLocaleString('tr-TR')}</p>
                              <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString('tr-TR')}</p>
                            </div>
                          </div>
                        ))}
                        <Link
                          href={`/orders?userId=${user.id}`}
                          className="block text-center text-primary-500 hover:underline py-2"
                        >
                          Tüm siparişleri görüntüle →
                        </Link>
                      </>
                    ) : (
                      <p className="text-gray-400 text-center py-8">Henüz sipariş yok</p>
                    )}
                  </div>
                )}

                {/* Products Tab */}
                {activeTab === 'products' && (
                  <div className="space-y-3">
                    {user.products && user.products.length > 0 ? (
                      <>
                        {user.products.map((product) => (
                          <div key={product.id} className="flex items-center gap-4 p-4 bg-dark-700 rounded-lg">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt={product.title}
                                width={60}
                                height={60}
                                className="rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-[60px] h-[60px] bg-dark-600 rounded-lg flex items-center justify-center">
                                <CubeIcon className="w-6 h-6 text-gray-500" />
                              </div>
                            )}
                            <div className="flex-1">
                              <Link href={`/products/${product.id}`} className="text-white font-medium hover:text-primary-500">
                                {product.title}
                              </Link>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(product.status)}
                                <span className="text-sm text-gray-500">{new Date(product.createdAt).toLocaleDateString('tr-TR')}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-white font-medium">₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}</p>
                            </div>
                          </div>
                        ))}
                        <Link
                          href={`/products?sellerId=${user.id}`}
                          className="block text-center text-primary-500 hover:underline py-2"
                        >
                          Tüm ürünleri görüntüle →
                        </Link>
                      </>
                    ) : (
                      <p className="text-gray-400 text-center py-8">Henüz ürün yok</p>
                    )}
                  </div>
                )}

                {/* Trades Tab */}
                {activeTab === 'trades' && (
                  <div className="space-y-3">
                    {user.recentTrades && user.recentTrades.length > 0 ? (
                      <>
                        {user.recentTrades.map((trade) => (
                          <div key={trade.id} className="p-4 bg-dark-700 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  trade.role === 'initiator' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'
                                }`}>
                                  {trade.role === 'initiator' ? 'Başlatan' : 'Alıcı'}
                                </span>
                                <Link href={`/trades/${trade.id}`} className="text-white font-medium hover:text-primary-500">
                                  {trade.tradeNumber || `#${trade.id.slice(0, 8)}`}
                                </Link>
                                {getStatusBadge(trade.status)}
                              </div>
                              <span className="text-sm text-gray-500">{new Date(trade.createdAt).toLocaleDateString('tr-TR')}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                              <p>
                                Karşı taraf: {trade.role === 'initiator' ? trade.receiver?.displayName : trade.initiator?.displayName}
                              </p>
                              <p className="mt-1">
                                Teklif: {trade.initiatorItems.length} ürün ↔ {trade.receiverItems.length} ürün
                                {trade.cashAmount && trade.cashAmount > 0 && ` + ₺${trade.cashAmount.toLocaleString('tr-TR')}`}
                              </p>
                            </div>
                          </div>
                        ))}
                        <Link
                          href={`/trades?userId=${user.id}`}
                          className="block text-center text-primary-500 hover:underline py-2"
                        >
                          Tüm takasları görüntüle →
                        </Link>
                      </>
                    ) : (
                      <p className="text-gray-400 text-center py-8">Henüz takas yok</p>
                    )}
                  </div>
                )}

                {/* Ratings Tab */}
                {activeTab === 'ratings' && (
                  <div className="space-y-4">
                    <h3 className="text-white font-medium">Alınan Değerlendirmeler</h3>
                    {user.receivedRatings && user.receivedRatings.length > 0 ? (
                      <div className="space-y-3">
                        {user.receivedRatings.map((rating) => (
                          <div key={rating.id} className="p-4 bg-dark-700 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <StarIcon
                                    key={star}
                                    className={`w-4 h-4 ${star <= rating.score ? 'text-yellow-500 fill-yellow-500' : 'text-gray-600'}`}
                                  />
                                ))}
                                <span className="text-white font-medium ml-2">{rating.score}/5</span>
                              </div>
                              <span className="text-sm text-gray-500">{new Date(rating.createdAt).toLocaleDateString('tr-TR')}</span>
                            </div>
                            {rating.comment && <p className="text-gray-300">{rating.comment}</p>}
                            <p className="text-sm text-gray-500 mt-2">
                              Değerlendiren: {rating.giver?.displayName || 'Anonim'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 py-4">Henüz değerlendirme yok</p>
                    )}

                    <h3 className="text-white font-medium mt-6">Verilen Değerlendirmeler</h3>
                    {user.givenRatings && user.givenRatings.length > 0 ? (
                      <div className="space-y-3">
                        {user.givenRatings.map((rating) => (
                          <div key={rating.id} className="p-4 bg-dark-700 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <StarIcon
                                    key={star}
                                    className={`w-4 h-4 ${star <= rating.score ? 'text-yellow-500 fill-yellow-500' : 'text-gray-600'}`}
                                  />
                                ))}
                                <span className="text-white font-medium ml-2">{rating.score}/5</span>
                              </div>
                              <span className="text-sm text-gray-500">{new Date(rating.createdAt).toLocaleDateString('tr-TR')}</span>
                            </div>
                            {rating.comment && <p className="text-gray-300">{rating.comment}</p>}
                            <p className="text-sm text-gray-500 mt-2">
                              Değerlendirilen: {rating.receiver?.displayName || 'Bilinmiyor'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 py-4">Henüz değerlendirme vermemiş</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="admin-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Hızlı İşlemler</h3>
              <div className="space-y-2">
                <Link
                  href={`/orders?userId=${user.id}`}
                  className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <ShoppingBagIcon className="w-5 h-5" />
                  <span>Tüm Siparişler ({user.stats?.ordersCount || 0})</span>
                </Link>
                <Link
                  href={`/products?sellerId=${user.id}`}
                  className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <CubeIcon className="w-5 h-5" />
                  <span>Tüm Ürünler ({user.stats?.productsCount || 0})</span>
                </Link>
                <Link
                  href={`/trades?userId=${user.id}`}
                  className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <ArrowPathIcon className="w-5 h-5" />
                  <span>Tüm Takaslar ({user.stats?.tradesCount || 0})</span>
                </Link>
              </div>
            </div>

            {/* Verification Status */}
            <div className="admin-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Doğrulama Durumu</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Email</span>
                  {user.isEmailVerified ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Telefon</span>
                  {user.isPhoneVerified ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Kimlik</span>
                  {user.isVerified ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Satıcı</span>
                  {user.isSeller ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Addresses */}
            {user.addresses && user.addresses.length > 0 && (
              <div className="admin-card p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <MapPinIcon className="w-5 h-5" />
                  Adresler ({user.addresses.length})
                </h3>
                <div className="space-y-3">
                  {user.addresses.map((address) => (
                    <div key={address.id} className="p-3 bg-dark-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium">{address.title}</p>
                        {address.isDefault && (
                          <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded">Varsayılan</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{address.fullAddress}</p>
                      <p className="text-sm text-gray-500">
                        {address.district}, {address.city}
                        {address.postalCode && ` - ${address.postalCode}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ban Modal */}
        {showBanModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-dark-800 rounded-xl p-6 max-w-md w-full mx-4 border border-dark-600">
              <h3 className="text-lg font-semibold text-white mb-4">Kullanıcıyı Banla</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ban Nedeni *
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-dark-800 rounded-xl p-6 max-w-md w-full mx-4 border border-dark-600">
              <h3 className="text-lg font-semibold text-white mb-4">Banı Kaldır</h3>
              <p className="text-gray-400 mb-6">
                Bu kullanıcının banını kaldırmak istediğinizden emin misiniz?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUnbanModal(false)}
                  className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
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
