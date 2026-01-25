'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  XCircleIcon,
  ArrowLeftIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/LanguageContext';

export default function PaymentFailPage() {
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

  const handleRetryPayment = async () => {
    // Guest users should go back to listings to start again
    if (isGuestCheckout) {
      router.push('/listings');
      return;
    }

    if (!paymentId) {
      if (payment?.orderId) {
        router.push(`/checkout?orderId=${payment.orderId}`);
      } else {
        router.push('/orders');
      }
      return;
    }

    try {
      const response = await paymentsApi.retry(paymentId);
      toast.success(locale === 'en' ? 'Payment retry initiated' : 'Ödeme tekrar denendi');
      if (response.data.paymentUrl) {
        window.location.href = response.data.paymentUrl;
      } else if (response.data.paymentHtml) {
        // For PayTR, redirect to payment page
        router.push(`/payment/${response.data.newPaymentId}`);
      } else {
        router.push('/orders');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to retry payment' : 'Ödeme tekrar denenemedi'));
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
          {/* Error Icon */}
          <div className="mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto"
            >
              <XCircleIcon className="w-12 h-12 text-red-500" />
            </motion.div>
          </div>

          {/* Error Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {locale === 'en' ? 'Payment Failed' : 'Ödeme Başarısız Oldu'}
          </h1>
          <p className="text-gray-600 mb-6">
            {locale === 'en' ? 'Your payment could not be completed. Please try again or choose a different payment method.' : 'Ödeme işleminiz tamamlanamadı. Lütfen tekrar deneyin veya farklı bir ödeme yöntemi seçin.'}
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
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Status:' : 'Durum:'}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {locale === 'en' ? 'Failed' : 'Başarısız'}
                  </span>
                </div>
                {payment.failureReason && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-gray-600 text-xs">
                      <strong>{locale === 'en' ? 'Error:' : 'Hata:'}</strong> {payment.failureReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Common Reasons */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-2">{locale === 'en' ? 'Possible reasons for payment failure:' : 'Ödeme başarısız olmasının olası nedenleri:'}</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>{locale === 'en' ? 'Insufficient balance' : 'Yetersiz bakiye'}</li>
                  <li>{locale === 'en' ? 'Card information error' : 'Kart bilgilerinde hata'}</li>
                  <li>{locale === 'en' ? '3D Secure verification failed' : '3D Secure doğrulaması başarısız'}</li>
                  <li>{locale === 'en' ? 'Transaction rejected by bank' : 'Banka tarafından işlem reddedildi'}</li>
                  <li>{locale === 'en' ? 'Internet connection problem' : 'İnternet bağlantı problemi'}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800">
              <strong>{locale === 'en' ? 'Need help?' : 'Yardıma mı ihtiyacınız var?'}</strong> {locale === 'en' ? 'If your payment issue persists, please contact ' : 'Ödeme sorununuz devam ederse, lütfen '}
              <Link href="/support" className="underline font-medium">
                {locale === 'en' ? 'our support team' : 'destek ekibimiz'}
              </Link>
              {locale === 'en' ? '.' : ' ile iletişime geçin.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isGuestCheckout ? (
              <Link
                href="/listings"
                className="btn-primary flex items-center justify-center gap-2"
              >
                {locale === 'en' ? 'Back to Listings' : 'İlanlara Dön'}
              </Link>
            ) : (
              <>
                <button
                  onClick={handleRetryPayment}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  {locale === 'en' ? 'Try Again' : 'Tekrar Dene'}
                </button>
                <Link
                  href="/orders"
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                  {locale === 'en' ? 'Back to My Orders' : 'Siparişlerime Dön'}
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
