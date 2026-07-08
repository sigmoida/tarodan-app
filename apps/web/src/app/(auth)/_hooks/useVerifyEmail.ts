'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type VerifyStatus = 'loading' | 'success' | 'error' | 'no-token';

/**
 * Email-verification flow. Reads the `token` from the URL and auto-verifies once
 * on mount (a ref guards against the strict-mode double call marking the token
 * "used"). Verify + resend are `useMutation`s, so `status`/loading/error derive
 * from mutation state instead of hand-rolled `useState`. `locale` drives the
 * toast/error language; the verify request is fired only from the token effect,
 * so a language switch never re-triggers it.
 */
export function useVerifyEmail(locale: string) {
  const token = useSearchParams().get('token');
  const verifyStartedRef = useRef(false);

  const verify = useMutation({
    mutationFn: (t: string) => api.post('/auth/verify-email', { token: t }),
    onSuccess: () =>
      toast.success(
        locale === 'tr'
          ? 'E-posta adresiniz doğrulandı!'
          : 'Email verified successfully!',
      ),
    onError: (error: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Email verification failed:', error);
      }
    },
  });

  useEffect(() => {
    if (!token || verifyStartedRef.current) return;
    verifyStartedRef.current = true;
    verify.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // locale intentionally excluded — changing locale must not re-fire

  const status: VerifyStatus = !token
    ? 'no-token'
    : verify.isSuccess
      ? 'success'
      : verify.isError
        ? 'error'
        : 'loading';

  const errorMessage = verify.isError
    ? (verify.error as { response?: { data?: { message?: string } } })?.response
        ?.data?.message ||
      (locale === 'tr' ? 'Doğrulama başarısız' : 'Verification failed')
    : '';

  const resendMutation = useMutation({
    mutationFn: (email: string) =>
      api.post('/auth/resend-verification', { email }),
    onSuccess: () =>
      toast.success(
        locale === 'tr'
          ? 'Doğrulama e-postası gönderildi'
          : 'Verification email sent',
      ),
    onError: (err: unknown) =>
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (locale === 'tr' ? 'Gönderilemedi' : 'Failed to send'),
      ),
  });

  const resend = (rawEmail: string) => {
    const email = rawEmail.trim();
    if (!email) {
      toast.error(
        locale === 'tr' ? 'E-posta adresi girin' : 'Enter email address',
      );
      return;
    }
    resendMutation.mutate(email);
  };

  return {
    status,
    errorMessage,
    resend,
    resendLoading: resendMutation.isPending,
    resendSuccess: resendMutation.isSuccess,
  };
}
