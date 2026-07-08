'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircleIcon,
  EnvelopeIcon,
  ShoppingBagIcon,
  UserPlusIcon,
  DocumentArrowDownIcon,
  TruckIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@tarodan/ui';


interface OrderDetails {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  product: {
    id: string;
    title: string;
    imageUrl?: string;
  } | null;
  createdAt: string;
}

interface InvoiceDetails {
  id: string;
  invoiceNumber: string;
}

// Calculate estimated delivery (3 business days from order date)
function getEstimatedDelivery(orderDate: string): string {
  const date = new Date(orderDate);
  let businessDays = 0;
  while (businessDays < 3) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }
  return date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(amount);
}

export default function CheckoutSuccessClient() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const orderId = searchParams.get('orderId') || '';
  const isGuest = searchParams.get('guest') === 'true';

  const { isAuthenticated } = useAuthStore();
  const [downloading, setDownloading] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['checkout-success-order', orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data as OrderDetails,
    enabled: !!orderId && isAuthenticated && !isGuest,
  });
  const order = orderQuery.data ?? null;
  const loading = orderQuery.isLoading;

  // YENİ eLogo e-Arşiv faturası (yoksa null → buton çıkmaz; sipariş teslimde kesilir)
  const invoiceQuery = useQuery({
    queryKey: ['checkout-success-invoice', orderId],
    queryFn: async () => {
      try {
        const res = await api.get(`/elogo/invoices/by-order/${orderId}`);
        return res.data?.id ? (res.data as InvoiceDetails) : null;
      } catch {
        return null; // Fatura henüz hazır değil
      }
    },
    enabled: !!order,
  });
  const invoice = invoiceQuery.data ?? null;

  const handleDownloadInvoice = async () => {
    if (!invoice?.id) return;

    setDownloading(true);
    try {
      const res = await api.get(`/elogo/invoices/${invoice.id}/pdf`);
      const url = (res.data as any)?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to download invoice:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-success-50 to-surface-elevated py-16">
      <div className="max-w-2xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          {/* Success Icon */}
          <div className="w-24 h-24 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-14 h-14 text-success-500" />
          </div>

          <h1 className="text-3xl font-bold text-heading mb-4">
            Siparişiniz Alındı! 🎉
          </h1>

          <p className="text-lg text-muted mb-8">
            Teşekkür ederiz! Siparişiniz başarıyla oluşturuldu.
          </p>

          {/* Order Summary - Dynamic */}
          {order && !loading && (
            <div className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle p-6 mb-8 text-left">
              <h2 className="font-semibold text-heading mb-4 text-center">Sipariş Özeti</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border-subtle">
                  <span className="text-muted">Sipariş No:</span>
                  <span className="font-semibold text-heading">{order.orderNumber}</span>
                </div>

                {order.product && (
                  <div className="flex justify-between items-center py-2 border-b border-border-subtle">
                    <span className="text-muted">Ürün:</span>
                    <span className="font-medium text-heading text-right max-w-[200px] truncate">
                      {order.product.title}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center py-2">
                  <span className="text-muted">Toplam Tutar:</span>
                  <span className="font-bold text-lg text-success-600">
                    {formatPrice(order.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Invoice Download Button */}
              {invoice && (
                <Button variant="secondary" onClick={handleDownloadInvoice}
                  disabled={downloading}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-surface-alt text-body font-medium rounded-xl hover:bg-border-subtle transition-colors disabled:opacity-50">
                  <DocumentArrowDownIcon className="w-5 h-5" />
                  {downloading ? 'İndiriliyor...' : 'Faturayı İndir (PDF)'}
                </Button>
              )}
            </div>
          )}

          {/* Estimated Delivery */}
          {order && !loading && (
            <div className="bg-info-50 border border-info-100 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-2">
                <TruckIcon className="w-6 h-6 text-info-500" />
                <span className="font-semibold text-heading">Tahmini Teslimat</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-info-700">
                <CalendarIcon className="w-5 h-5" />
                <span className="font-medium">{getEstimatedDelivery(order.createdAt)}</span>
              </div>
              <p className="text-sm text-muted mt-2">
                *Teslimat süresi satıcı ve kargo firmasına göre değişebilir.
              </p>
            </div>
          )}

          {/* Email Info */}
          {email && (
            <div className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <EnvelopeIcon className="w-6 h-6 text-primary-500" />
                <span className="font-medium text-heading">Sipariş Onayı Gönderildi</span>
              </div>
              <p className="text-muted">
                Sipariş detaylarınız ve faturanız şu adrese gönderildi:
              </p>
              <p className="font-semibold text-primary-500 mt-2">{email}</p>
            </div>
          )}

          {/* What's Next */}
          <div className="bg-surface rounded-2xl p-6 mb-8">
            <h2 className="font-semibold text-heading mb-4">Sırada Ne Var?</h2>
            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">1</span>
                </div>
                <p className="text-muted">
                  E-postanızı kontrol edin - sipariş onayı ve fatura gönderildi
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">2</span>
                </div>
                <p className="text-muted">
                  Satıcı siparişinizi hazırlayıp kargoya verecek
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">3</span>
                </div>
                <p className="text-muted">
                  Kargo takip numarası e-posta ile gönderilecek
                </p>
              </div>
            </div>
          </div>

          {/* CTA: Create Account - Only for guests */}
          {isGuest && (
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6 mb-8">
              <UserPlusIcon className="w-10 h-10 text-primary-500 mx-auto mb-3" />
              <h3 className="font-semibold text-heading mb-2">
                Siparişlerinizi Kolayca Takip Edin
              </h3>
              <p className="text-muted text-sm mb-4">
                Ücretsiz üye olun ve tüm siparişlerinizi tek yerden yönetin,
                favorilerinizi kaydedin ve özel fırsatlardan haberdar olun.
              </p>
              <Link
                href={`/register?email=${encodeURIComponent(email)}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-colors"
              >
                <UserPlusIcon className="w-5 h-5" />
                Ücretsiz Üye Ol
              </Link>
            </div>
          )}

          {/* Continue Shopping */}
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 text-muted hover:text-primary-500 transition-colors"
          >
            <ShoppingBagIcon className="w-5 h-5" />
            Alışverişe Devam Et
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
