'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeftIcon, TruckIcon, MapPinIcon, MagnifyingGlassIcon, TagIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { ordersApi } from '@/lib/api';
import { useTranslation } from '@/i18n';

interface GuestOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  product: { id: string; title: string; image?: string };
  seller: { id: string; displayName: string; isVerified?: boolean };
  shippingAddress?: Record<string, string>;
  shipment?: {
    provider: string;
    trackingNumber: string;
    trackingUrl: string | null;
    status: string;
    estimatedDelivery?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

const getStatusLabels = (locale: string): Record<string, { label: string; color: string; bg: string }> => ({
  pending_payment: { label: locale === 'en' ? 'Awaiting Payment' : 'Ödeme Bekleniyor', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  paid: { label: locale === 'en' ? 'Paid' : 'Ödendi', color: 'text-green-600', bg: 'bg-green-100' },
  preparing: { label: locale === 'en' ? 'Preparing' : 'Hazırlanıyor', color: 'text-orange-600', bg: 'bg-orange-100' },
  shipped: { label: locale === 'en' ? 'Shipped' : 'Kargoya Verildi', color: 'text-purple-600', bg: 'bg-purple-100' },
  delivered: { label: locale === 'en' ? 'Delivered' : 'Teslim Edildi', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: locale === 'en' ? 'Completed' : 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: locale === 'en' ? 'Cancelled' : 'İptal Edildi', color: 'text-red-600', bg: 'bg-red-100' },
  refund_requested: { label: locale === 'en' ? 'Refund Requested' : 'İade Talebi', color: 'text-orange-600', bg: 'bg-orange-100' },
  refunded: { label: locale === 'en' ? 'Refunded' : 'İade Edildi', color: 'text-gray-600', bg: 'bg-gray-100' },
});

export default function TrackOrderPage() {
  const searchParams = useSearchParams();
  const { locale } = useTranslation();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<GuestOrderDetail | null>(null);

  const [autoFetched, setAutoFetched] = useState(false);
  useEffect(() => {
    const orderFromUrl = searchParams.get('orderNumber') || '';
    const emailFromUrl = searchParams.get('email') || '';
    if (orderFromUrl) setOrderNumber(orderFromUrl);
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [searchParams]);

  useEffect(() => {
    const orderFromUrl = searchParams.get('orderNumber')?.trim();
    const emailFromUrl = searchParams.get('email')?.trim();
    if (!orderFromUrl || !emailFromUrl || !emailFromUrl.includes('@') || autoFetched) return;

    const fetchByUrl = async () => {
      setAutoFetched(true);
      setLoading(true);
      setError('');
      setOrder(null);
      try {
        const res = await ordersApi.trackGuest({
          orderNumber: orderFromUrl,
          email: emailFromUrl.toLowerCase(),
        });
        setOrder(res.data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError(locale === 'en' ? 'Order not found. Check your details.' : 'Sipariş bulunamadı. Bilgileri kontrol edin.');
        } else {
          setError(err.response?.data?.message || (locale === 'en' ? 'Could not load order' : 'Sipariş yüklenemedi'));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchByUrl();
  }, [searchParams, autoFetched, locale]);

  const statusLabels = getStatusLabels(locale);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!orderNumber.trim()) {
      setError(locale === 'en' ? 'Enter order number' : 'Sipariş numarası girin');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError(locale === 'en' ? 'Enter a valid email address' : 'Geçerli bir e-posta adresi girin');
      return;
    }

    setLoading(true);
    setOrder(null);
    try {
      const res = await ordersApi.trackGuest({
        orderNumber: orderNumber.trim(),
        email: email.trim().toLowerCase(),
      });
      setOrder(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(locale === 'en' ? 'Order not found. Check your details.' : 'Sipariş bulunamadı. Bilgileri kontrol edin.');
      } else {
        setError(err.response?.data?.message || (locale === 'en' ? 'Could not load order' : 'Sipariş yüklenemedi'));
      }
      toast.error(err.response?.data?.message || (locale === 'en' ? 'Order not found' : 'Sipariş bulunamadı'));
    } finally {
      setLoading(false);
    }
  };

  const status = order ? (statusLabels[order.status] || { label: order.status, color: 'text-gray-600', bg: 'bg-gray-100' }) : null;
  const shipAddr = order?.shippingAddress as Record<string, string> | undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {locale === 'en' ? 'Track your order' : 'Sipariş Takip'}
          </h1>
        </div>

        {!order ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            {loading && searchParams.get('orderNumber') && searchParams.get('email') ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <span className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
                <p className="text-gray-600">{locale === 'en' ? 'Loading order details...' : 'Sipariş bilgileriniz yükleniyor...'}</p>
              </div>
            ) : (
            <>
            <p className="text-gray-600 mb-4">
              {locale === 'en'
                ? 'Enter your order number and the email address you used when placing the order to view status and tracking.'
                : 'Sipariş numaranız ve siparişte kullandığınız e-posta adresi ile sipariş durumunu ve kargo bilgisini görebilirsiniz.'}
            </p>
            <form onSubmit={handleTrack} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {locale === 'en' ? 'Order number' : 'Sipariş numarası'} *
                </label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="örn. ORD-20260101-XXXX"
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {locale === 'en' ? 'Email address' : 'E-posta adresi'} *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="siparişte kullandığınız e-posta"
                  className="input w-full"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <MagnifyingGlassIcon className="w-5 h-5" />
                )}
                {locale === 'en' ? 'View order' : 'Siparişi Görüntüle'}
              </button>
            </form>
            <p className="text-sm text-gray-500 mt-4">
              {locale === 'en'
                ? 'You can find the order number in the confirmation email we sent after your purchase.'
                : 'Sipariş numarasını, satın alma sonrası gönderdiğimiz onay e-postasında bulabilirsiniz.'}
            </p>
            </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {locale === 'en' ? 'Order' : 'Sipariş'} #{order.orderNumber}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(order.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span className={`px-4 py-2 rounded-full font-medium ${status!.color} ${status!.bg}`}>
                {status!.label}
              </span>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-3">{locale === 'en' ? 'Product' : 'Ürün'}</h3>
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {order.product?.image ? (
                    <Image src={order.product.image} alt={order.product.title} width={80} height={80} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <TagIcon className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/listings/${order.product?.id}`} className="font-medium text-gray-900 hover:text-primary-500 line-clamp-2">
                    {order.product?.title}
                  </Link>
                  <p className="text-lg font-bold text-primary-500 mt-1">
                    {Number(order.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </p>
                </div>
              </div>
            </div>

            {order.shipment && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5 text-primary-500" />
                  {locale === 'en' ? 'Shipping' : 'Kargo'}
                </h3>
                <div className="space-y-2 text-gray-700">
                  <p><span className="text-gray-500">{locale === 'en' ? 'Carrier:' : 'Firma:'}</span> {order.shipment.provider}</p>
                  <p><span className="text-gray-500">{locale === 'en' ? 'Tracking number:' : 'Takip no:'}</span>{' '}
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">{order.shipment.trackingNumber}</span>
                  </p>
                  {order.shipment.trackingUrl && (
                    <a
                      href={order.shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-500 hover:underline"
                    >
                      {locale === 'en' ? 'Track shipment' : 'Kargoyu takip et'} →
                    </a>
                  )}
                </div>
              </div>
            )}

            {shipAddr && (shipAddr.address || shipAddr.fullName) && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPinIcon className="w-5 h-5 text-primary-500" />
                  {locale === 'en' ? 'Delivery address' : 'Teslimat adresi'}
                </h3>
                <div className="text-gray-700">
                  {shipAddr.fullName && <p className="font-medium">{shipAddr.fullName}</p>}
                  {shipAddr.address && <p>{shipAddr.address}</p>}
                  {(shipAddr.district || shipAddr.city) && (
                    <p>{[shipAddr.district, shipAddr.city].filter(Boolean).join(', ')} {shipAddr.zipCode || ''}</p>
                  )}
                  {shipAddr.phone && <p>Tel: {shipAddr.phone}</p>}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setOrder(null); setError(''); }}
                className="btn-secondary flex-1"
              >
                {locale === 'en' ? 'Track another order' : 'Başka sipariş sorgula'}
              </button>
              <Link href="/listings" className="btn-primary flex-1 text-center">
                {locale === 'en' ? 'Continue shopping' : 'Alışverişe devam et'}
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
