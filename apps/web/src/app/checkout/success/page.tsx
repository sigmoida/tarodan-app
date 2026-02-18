'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
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

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const orderId = searchParams.get('orderId') || '';
  const isGuest = searchParams.get('guest') === 'true';

  const { isAuthenticated } = useAuthStore();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchOrderDetails() {
      if (!orderId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch order details
        if (isAuthenticated && !isGuest) {
          const orderRes = await api.get(`/orders/${orderId}`);
          setOrder(orderRes.data);

          // Fetch invoice details
          try {
            const invoiceRes = await api.get(`/invoices/order/${orderId}`);
            setInvoice(invoiceRes.data);
          } catch {
            // Invoice might not be ready yet
          }
        }
      } catch (error) {
        console.error('Failed to fetch order details:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchOrderDetails();
  }, [orderId, isAuthenticated, isGuest]);

  const handleDownloadInvoice = async () => {
    if (!invoice?.id) return;

    setDownloading(true);
    try {
      const response = await api.get(`/invoices/download/${invoice.id}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fatura-${invoice.invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-16">
      <div className="max-w-2xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          {/* Success Icon */}
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-14 h-14 text-green-500" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Siparişiniz Alındı! 🎉
          </h1>

          <p className="text-lg text-gray-600 mb-8">
            Teşekkür ederiz! Siparişiniz başarıyla oluşturuldu.
          </p>

          {/* Order Summary - Dynamic */}
          {order && !loading && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8 text-left">
              <h2 className="font-semibold text-gray-900 mb-4 text-center">Sipariş Özeti</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Sipariş No:</span>
                  <span className="font-semibold text-gray-900">{order.orderNumber}</span>
                </div>

                {order.product && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Ürün:</span>
                    <span className="font-medium text-gray-900 text-right max-w-[200px] truncate">
                      {order.product.title}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Toplam Tutar:</span>
                  <span className="font-bold text-lg text-green-600">
                    {formatPrice(order.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Invoice Download Button */}
              {invoice && (
                <button
                  onClick={handleDownloadInvoice}
                  disabled={downloading}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <DocumentArrowDownIcon className="w-5 h-5" />
                  {downloading ? 'İndiriliyor...' : 'Faturayı İndir (PDF)'}
                </button>
              )}
            </div>
          )}

          {/* Estimated Delivery */}
          {order && !loading && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-2">
                <TruckIcon className="w-6 h-6 text-blue-500" />
                <span className="font-semibold text-gray-900">Tahmini Teslimat</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <CalendarIcon className="w-5 h-5" />
                <span className="font-medium">{getEstimatedDelivery(order.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                *Teslimat süresi satıcı ve kargo firmasına göre değişebilir.
              </p>
            </div>
          )}

          {/* Email Info */}
          {email && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <EnvelopeIcon className="w-6 h-6 text-primary-500" />
                <span className="font-medium text-gray-900">Sipariş Onayı Gönderildi</span>
              </div>
              <p className="text-gray-600">
                Sipariş detaylarınız ve faturanız şu adrese gönderildi:
              </p>
              <p className="font-semibold text-primary-500 mt-2">{email}</p>
            </div>
          )}

          {/* What's Next */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <h2 className="font-semibold text-gray-900 mb-4">Sırada Ne Var?</h2>
            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">1</span>
                </div>
                <p className="text-gray-600">
                  E-postanızı kontrol edin - sipariş onayı ve fatura gönderildi
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">2</span>
                </div>
                <p className="text-gray-600">
                  Satıcı siparişinizi hazırlayıp kargoya verecek
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">3</span>
                </div>
                <p className="text-gray-600">
                  Kargo takip numarası e-posta ile gönderilecek
                </p>
              </div>
            </div>
          </div>

          {/* CTA: Create Account - Only for guests */}
          {isGuest && (
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6 mb-8">
              <UserPlusIcon className="w-10 h-10 text-primary-500 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">
                Siparişlerinizi Kolayca Takip Edin
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                Ücretsiz üye olun ve tüm siparişlerinizi tek yerden yönetin,
                favorilerinizi kaydedin ve özel fırsatlardan haberdar olun.
              </p>
              <Link
                href={`/register?email=${encodeURIComponent(email)}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-colors"
              >
                <UserPlusIcon className="w-5 h-5" />
                Ücretsiz Üye Ol
              </Link>
            </div>
          )}

          {/* Continue Shopping */}
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 transition-colors"
          >
            <ShoppingBagIcon className="w-5 h-5" />
            Alışverişe Devam Et
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
