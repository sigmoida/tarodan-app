'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function IyzicoCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const paymentId = searchParams.get('paymentId');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!paymentId && !token) {
      setStatus('error');
      setTimeout(() => router.push('/orders'), 3000);
      return;
    }

    // Process callback
    const processCallback = async () => {
      try {
        // The callback is handled by backend webhook
        // This page just redirects based on the result
        // Wait a bit for backend to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (paymentId) {
          router.push(`/payment/success?paymentId=${paymentId}`);
        } else {
          router.push('/payment/success');
        }
      } catch (error) {
        console.error('Callback processing error:', error);
        setStatus('error');
        setTimeout(() => router.push('/payment/fail'), 2000);
      }
    };

    processCallback();
  }, [paymentId, token, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <ArrowPathIcon className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">
          {status === 'processing' && 'Ödeme işleniyor...'}
          {status === 'success' && 'Ödeme başarılı! Yönlendiriliyorsunuz...'}
          {status === 'error' && 'Bir hata oluştu. Yönlendiriliyorsunuz...'}
        </p>
      </div>
    </div>
  );
}
