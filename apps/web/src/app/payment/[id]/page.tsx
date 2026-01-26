'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CreditCardIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const paymentId = params.id as string;
  const isGuestCheckout = searchParams.get('guest') === 'true';

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Allow access for authenticated users OR guest checkout
    if (!isAuthenticated && !isGuestCheckout) {
      router.push(`/login?redirect=/payment/${paymentId}`);
      return;
    }

    fetchPayment();
  }, [paymentId, isAuthenticated, isGuestCheckout]);

  const fetchPayment = async () => {
    try {
      setIsLoading(true);
      // Use lightweight status endpoint for polling
      // Use guest endpoint if guest checkout
      const response = isGuestCheckout 
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatusLight(paymentId);
      const paymentData = response.data;

      setPayment(paymentData);

      // If payment has HTML content (PayTR iframe), set it
      if (paymentData.paymentHtml) {
        setPaymentHtml(paymentData.paymentHtml);
      } else if (paymentData.paymentUrl) {
        // For Iyzico, redirect to payment URL
        if (paymentData.provider === 'iyzico') {
          window.location.href = paymentData.paymentUrl;
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch payment:', error);
      toast.error('Ödeme bilgisi yüklenemedi');
      // Redirect to home for guests, orders page for authenticated users
      router.push(isGuestCheckout ? '/' : '/orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentComplete = () => {
    setIsProcessing(true);
    // Poll for payment status
    const interval = setInterval(async () => {
      try {
        // Use guest endpoint if guest checkout
        const response = isGuestCheckout
          ? await paymentsApi.getStatusLightGuest(paymentId)
          : await paymentsApi.getStatus(paymentId);
        const paymentData = response.data;

        if (paymentData.status === 'completed') {
          clearInterval(interval);
          toast.success('Ödeme başarıyla tamamlandı!');
          router.push(`/payment/success?paymentId=${paymentId}${isGuestCheckout ? '&guest=true' : ''}`);
        } else if (paymentData.status === 'failed') {
          clearInterval(interval);
          toast.error('Ödeme başarısız oldu');
          router.push(`/payment/fail?paymentId=${paymentId}${isGuestCheckout ? '&guest=true' : ''}`);
        }
      } catch (error) {
        console.error('Failed to check payment status:', error);
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setIsProcessing(false);
    }, 300000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ArrowPathIcon className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Ödeme bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Ödeme bulunamadı</p>
          <button
            onClick={() => router.push('/orders')}
            className="btn-primary"
          >
            Siparişlerime Dön
          </button>
        </div>
      </div>
    );
  }

  // If payment is already completed or failed, redirect
  if (payment.status === 'completed') {
    router.push(`/payment/success?paymentId=${paymentId}`);
    return null;
  }

  if (payment.status === 'failed') {
    router.push(`/payment/fail?paymentId=${paymentId}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Ödeme</h1>
          <p className="text-gray-600">
            {payment.provider === 'iyzico' ? 'iyzico' : 'PayTR'} ile güvenli ödeme
          </p>
        </div>

        {/* Payment Info Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">Ödeme Tutarı</p>
              <p className="text-2xl font-bold text-gray-900">
                {payment.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Durum</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                payment.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : payment.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {payment.status === 'pending' && 'Beklemede'}
                {payment.status === 'completed' && 'Tamamlandı'}
                {payment.status === 'failed' && 'Başarısız'}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ShieldCheckIcon className="w-5 h-5 text-green-500" />
              <span>256-bit SSL ile şifrelenmiş güvenli ödeme</span>
            </div>
          </div>
        </div>

        {/* Payment Content */}
        {paymentHtml ? (
          // PayTR iframe
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCardIcon className="w-6 h-6 text-primary-500" />
              Ödeme Formu
            </h2>
            <div
              dangerouslySetInnerHTML={{ __html: paymentHtml }}
              className="payment-iframe-container"
            />
            <p className="text-sm text-gray-500 mt-4 text-center">
              Ödeme tamamlandıktan sonra otomatik olarak yönlendirileceksiniz.
            </p>
          </motion.div>
        ) : payment.paymentUrl ? (
          // Iyzico redirect
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-8 text-center"
          >
            <CreditCardIcon className="w-16 h-16 text-primary-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ödeme Sayfasına Yönlendiriliyorsunuz</h2>
            <p className="text-gray-600 mb-6">
              Güvenli ödeme sayfasına yönlendiriliyorsunuz. Lütfen bekleyin...
            </p>
            <button
              onClick={() => window.location.href = payment.paymentUrl}
              className="btn-primary"
            >
              Ödeme Sayfasına Git
            </button>
          </motion.div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ödeme Bilgisi Bulunamadı</h2>
            <p className="text-gray-600 mb-6">
              Ödeme sayfası bilgisi yüklenemedi. Lütfen tekrar deneyin.
            </p>
            <button
              onClick={fetchPayment}
              className="btn-primary"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>Yardıma mı ihtiyacınız var?</strong> Ödeme sırasında sorun yaşarsanız, 
            lütfen{' '}
            <a href="/support" className="underline font-medium">
              destek ekibimiz
            </a>
            {' '}ile iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  );
}
