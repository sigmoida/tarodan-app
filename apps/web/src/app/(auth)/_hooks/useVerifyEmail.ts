'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type VerifyStatus = 'loading' | 'success' | 'error' | 'no-token';

/**
 * Email-verification flow. Reads the `token` from the URL and auto-verifies once
 * on mount (a ref guards against the strict-mode double call marking the token
 * "used"). Also exposes a resend action for expired/missing links. `locale`
 * drives the toast/error language; it is intentionally NOT an effect dep so a
 * language switch never re-fires the verify request.
 */
export function useVerifyEmail(locale: string) {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const verifyStartedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }
    if (verifyStartedRef.current) return;
    verifyStartedRef.current = true;

    (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
        toast.success(locale === 'tr' ? 'E-posta adresiniz doğrulandı!' : 'Email verified successfully!');
      } catch (error: unknown) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Email verification failed:', error);
        }
        setStatus('error');
        setErrorMessage(
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            (locale === 'tr' ? 'Doğrulama başarısız' : 'Verification failed'),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // locale intentionally excluded — changing locale must not re-trigger the API call

  const resend = async (rawEmail: string) => {
    const email = rawEmail.trim();
    if (!email) {
      toast.error(locale === 'tr' ? 'E-posta adresi girin' : 'Enter email address');
      return;
    }
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await api.post('/auth/resend-verification', { email });
      setResendSuccess(true);
      toast.success(locale === 'tr' ? 'Doğrulama e-postası gönderildi' : 'Verification email sent');
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (locale === 'tr' ? 'Gönderilemedi' : 'Failed to send'),
      );
    } finally {
      setResendLoading(false);
    }
  };

  return { status, errorMessage, resend, resendLoading, resendSuccess };
}
