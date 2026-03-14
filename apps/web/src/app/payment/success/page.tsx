'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  CreditCardIcon,
  DocumentArrowDownIcon,
  TruckIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { paymentsApi, api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';

interface InvoiceDetails {
  id: string;
  invoiceNumber: string;
}

// Calculate estimated delivery (3 business days from order date)
function getEstimatedDelivery(orderDate: string, locale: string): string {
  const date = new Date(orderDate);
  let businessDays = 0;
  while (businessDays < 3) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const paymentId = searchParams.get('paymentId');
  const isGuestCheckout = searchParams.get('guest') === 'true';
  const isMembershipPayment = searchParams.get('type') === 'membership';

  // Support both cases for orderId from URL
  const orderIdFromUrl = searchParams.get('orderId') || searchParams.get('orderid');

  const [payment, setPayment] = useState<any>(null);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(false);

  useEffect(() => {
    // Üyelik ödemesi için bu sayfa sipariş sayfası; doğru sayfaya yönlendir
    if (isMembershipPayment) {
      router.replace('/membership/success');
      return;
    }

    // Read guest from URL directly so we don't redirect before searchParams are ready (Next.js can delay them)
    const urlGuest = typeof window !== 'undefined' && window.location.search.includes('guest=true');
    const guestOk = isGuestCheckout || urlGuest;

    // Allow access for authenticated users OR guest checkout (URL param)
    if (!isAuthenticated && !guestOk) {
      router.push('/login');
      return;
    }

    if (paymentId) {
      fetchPayment();
    } else {
      setIsLoading(false);
    }
  }, [paymentId, isAuthenticated, isGuestCheckout, isMembershipPayment, router]);

  const fetchPayment = async () => {
    try {
      const isGuest = isGuestCheckout || (typeof window !== 'undefined' && window.location.search.includes('guest=true'));
      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId!)
        : await paymentsApi.getStatus(paymentId!);

      const paymentData = response.data;
      setPayment(paymentData);

      const actualOrderId = paymentData?.orderId || orderIdFromUrl;

      // Fetch invoice (with retry because it might be generating)
      if (actualOrderId && paymentId) {
        attemptFetchInvoice(actualOrderId, paymentId, 0);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch payment:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const attemptFetchInvoice = async (orderId: string, paymentId: string, retryCount: number) => {
    try {
      // Use public endpoint for better reliability even if auth exists (matches current session)
      const url = isAuthenticated
        ? `/invoices/order/${orderId}?paymentId=${paymentId}`
        : `/invoices/order/${orderId}/public?paymentId=${paymentId}`;

      const invoiceRes = await api.get(url);
      if (invoiceRes.data) {
        setInvoice(invoiceRes.data);
        setInvoiceError(false);
      }
    } catch (error) {
      // If 404 and we have retries left, try again in 2 seconds
      if (retryCount < 5) {
        setTimeout(() => attemptFetchInvoice(orderId, paymentId, retryCount + 1), 2000);
      } else {
        setInvoiceError(true);
      }
    }
  };

  const handleDownloadInvoice = async () => {
    if (!invoice?.id || !paymentId) return;

    setDownloading(true);
    try {
      const url = isAuthenticated
        ? `/invoices/download/${invoice.id}?paymentId=${paymentId}`
        : `/invoices/download/${invoice.id}/public?paymentId=${paymentId}`;

      const response = await api.get(url, {
        responseType: 'blob',
      });

      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `fatura-${invoice.invoiceNumber || invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to download invoice:', error);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm p-8 text-center"
        >
          {/* Success Icon */}
          <div className="mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto"
            >
              <CheckCircleIcon className="w-12 h-12 text-green-500" />
            </motion.div>
          </div>

          {/* Success Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {locale === 'en' ? 'Payment Completed Successfully!' : 'Ödeme Başarıyla Tamamlandı!'}
          </h1>
          <p className="text-gray-600 mb-6">
            {locale === 'en' ? 'Your payment has been received and your order is being prepared.' : 'Ödemeniz alındı ve siparişiniz hazırlanmaya başlandı.'}
          </p>

          {/* Payment Details */}
          {payment && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-primary-500" />
                {locale === 'en' ? 'Payment Details' : 'Ödeme Detayları'}
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Payment Amount:' : 'Ödeme Tutarı:'}</span>
                  <span className="font-semibold">
                    {payment.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Payment Method:' : 'Ödeme Yöntemi:'}</span>
                  <span className="font-semibold">
                    PayTR
                  </span>
                </div>
                {payment.providerTransactionId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{locale === 'en' ? 'Transaction ID:' : 'İşlem No:'}</span>
                    <span className="font-mono text-xs">
                      {payment.providerTransactionId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Status:' : 'Durum:'}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {locale === 'en' ? 'Completed' : 'Tamamlandı'}
                  </span>
                </div>
              </div>

              {/* Invoice Download Button */}
              {invoice ? (
                <button
                  onClick={handleDownloadInvoice}
                  disabled={downloading}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-50 text-primary-700 font-medium rounded-lg border border-primary-200 hover:bg-primary-100 transition-colors disabled:opacity-50"
                >
                  <DocumentArrowDownIcon className="w-5 h-5" />
                  {downloading
                    ? (locale === 'en' ? 'Downloading...' : 'İndiriliyor...')
                    : (locale === 'en' ? 'Download Invoice (PDF)' : 'Faturayı İndir (PDF)')}
                </button>
              ) : !invoiceError ? (
                <div className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 text-gray-400 text-sm font-medium rounded-lg border border-gray-100 border-dashed">
                  <div className="animate-spin h-3 w-3 border-2 border-gray-200 border-t-gray-400 rounded-full"></div>
                  {locale === 'en' ? 'Preparing Invoice...' : 'Fatura Hazırlanıyor...'}
                </div>
              ) : null}
            </div>
          )}

          {/* Estimated Delivery */}
          {payment?.createdAt && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TruckIcon className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-900">
                  {locale === 'en' ? 'Estimated Delivery' : 'Tahmini Teslimat'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <CalendarIcon className="w-5 h-5" />
                <span className="font-medium">{getEstimatedDelivery(payment.createdAt, locale)}</span>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                {locale === 'en'
                  ? '*Delivery time may vary depending on the seller and shipping company.'
                  : '*Teslimat süresi satıcı ve kargo firmasına göre değişebilir.'}
              </p>
            </div>
          )}

          {/* Info Message: logged-in → Siparişlerim; guest → track-order with order no + email */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800">
              <strong>{locale === 'en' ? 'Information:' : 'Bilgilendirme:'}</strong>{' '}
              {isAuthenticated
                ? (locale === 'en'
                  ? <>Order confirmation email has been sent. You can track your order from the <Link href="/orders" className="underline font-medium">My Orders</Link> page.</>
                  : <>Sipariş onay e-postası gönderildi. Sipariş durumunuzu <Link href="/orders" className="underline font-medium">Siparişlerim</Link> sayfasından takip edebilirsiniz.</>)
                : (locale === 'en'
                  ? <>Order confirmation email has been sent to your email. You can track your order from the <Link href="/track-order" className="underline font-medium">Track order</Link> page (use the order number from the email).</>
                  : <>Sipariş onay e-postası e-posta adresinize gönderildi. Siparişinizi <Link href="/track-order" className="underline font-medium">Sipariş takip</Link> sayfasından (e-postadaki sipariş numarası ile) takip edebilirsiniz.</>)
              }
            </p>
          </div>

          {/* Action Buttons: logged-in → Siparişlerim (or order detail); guest → track-order */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <Link
                href={payment?.orderId ? `/orders/${payment.orderId}` : '/orders'}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {locale === 'en' ? 'View my order' : 'Siparişimi Görüntüle'}
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
            ) : (
              <Link
                href="/track-order"
                className="btn-primary flex items-center justify-center gap-2"
              >
                {locale === 'en' ? 'Track my order' : 'Siparişimi takip et'}
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
            )}
            <Link
              href="/listings"
              className="btn-secondary flex items-center justify-center gap-2"
            >
              {locale === 'en' ? 'Continue Shopping' : 'Alışverişe Devam Et'}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
