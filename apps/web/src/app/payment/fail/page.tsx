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

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const paymentId = searchParams.get('paymentId');

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (paymentId) {
      fetchPayment();
    } else {
      setIsLoading(false);
    }
  }, [paymentId, isAuthenticated]);

  const fetchPayment = async () => {
    try {
      const response = await paymentsApi.getStatus(paymentId!);
      setPayment(response.data);
    } catch (error) {
      console.error('Failed to fetch payment:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryPayment = async () => {
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
      toast.success('Ödeme tekrar denendi');
      if (response.data.paymentUrl) {
        window.location.href = response.data.paymentUrl;
      } else if (response.data.paymentHtml) {
        // For PayTR, redirect to payment page
        router.push(`/payment/${response.data.newPaymentId}`);
      } else {
        router.push('/orders');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ödeme tekrar denenemedi');
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
            Ödeme Başarısız Oldu
          </h1>
          <p className="text-gray-600 mb-6">
            Ödeme işleminiz tamamlanamadı. Lütfen tekrar deneyin veya farklı bir ödeme yöntemi seçin.
          </p>

          {/* Payment Details */}
          {payment && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-primary-500" />
                Ödeme Detayları
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Ödeme Tutarı:</span>
                  <span className="font-semibold">
                    ₺{payment.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ödeme Yöntemi:</span>
                  <span className="font-semibold">
                    {payment.provider === 'iyzico' ? 'iyzico' : 'PayTR'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Durum:</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Başarısız
                  </span>
                </div>
                {payment.failureReason && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-gray-600 text-xs">
                      <strong>Hata:</strong> {payment.failureReason}
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
                <p className="font-semibold mb-2">Ödeme başarısız olmasının olası nedenleri:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Yetersiz bakiye</li>
                  <li>Kart bilgilerinde hata</li>
                  <li>3D Secure doğrulaması başarısız</li>
                  <li>Banka tarafından işlem reddedildi</li>
                  <li>İnternet bağlantı problemi</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800">
              <strong>Yardıma mı ihtiyacınız var?</strong> Ödeme sorununuz devam ederse, 
              lütfen{' '}
              <Link href="/support" className="underline font-medium">
                destek ekibimiz
              </Link>
              {' '}ile iletişime geçin.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleRetryPayment}
              className="btn-primary flex items-center justify-center gap-2"
            >
              Tekrar Dene
            </button>
            <Link
              href="/orders"
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Siparişlerime Dön
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
