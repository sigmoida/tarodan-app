'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const paymentId = searchParams.get('paymentId');
  const isGuestCheckout = searchParams.get('guest') === 'true';

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Allow access for authenticated users OR guest checkout
    if (!isAuthenticated && !isGuestCheckout) {
      router.push('/login');
      return;
    }

    if (paymentId) {
      fetchPayment();
    } else {
      setIsLoading(false);
    }
  }, [paymentId, isAuthenticated, isGuestCheckout]);

  const fetchPayment = async () => {
    try {
      // Use guest endpoint if guest checkout
      const response = isGuestCheckout 
        ? await paymentsApi.getStatusLightGuest(paymentId!)
        : await paymentsApi.getStatus(paymentId!);
      setPayment(response.data);
    } catch (error) {
      console.error('Failed to fetch payment:', error);
    } finally {
      setIsLoading(false);
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
                    ₺{payment.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Payment Method:' : 'Ödeme Yöntemi:'}</span>
                  <span className="font-semibold">
                    {payment.provider === 'iyzico' ? 'iyzico' : 'PayTR'}
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
            </div>
          )}

          {/* Info Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800">
              <strong>{locale === 'en' ? 'Information:' : 'Bilgilendirme:'}</strong>{' '}
              {isGuestCheckout 
                ? (locale === 'en' 
                    ? 'Order confirmation email has been sent to your email address.' 
                    : 'Sipariş onay e-postası e-posta adresinize gönderildi.')
                : (locale === 'en' 
                    ? <>Order confirmation email has been sent to your email address. You can track your order status from the <Link href="/orders" className="underline font-medium">My Orders</Link> page.</>
                    : <>Sipariş onay e-postası e-posta adresinize gönderildi. Sipariş durumunuzu <Link href="/orders" className="underline font-medium">Siparişlerim</Link> sayfasından takip edebilirsiniz.</>)
              }
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {!isGuestCheckout && (
              <Link
                href="/orders"
                className="btn-primary flex items-center justify-center gap-2"
              >
                {locale === 'en' ? 'Go to My Orders' : 'Siparişlerime Git'}
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
            )}
            <Link
              href="/listings"
              className={`${isGuestCheckout ? 'btn-primary' : 'btn-secondary'} flex items-center justify-center gap-2`}
            >
              {locale === 'en' ? 'Continue Shopping' : 'Alışverişe Devam Et'}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
