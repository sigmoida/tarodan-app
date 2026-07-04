'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

/** Resolve the post-login target: sessionStorage hint → ?redirect → home. */
function resolveRedirect(): string {
  let redirect: string | null = null;
  try {
    redirect = sessionStorage.getItem('login_redirect');
    if (redirect) sessionStorage.removeItem('login_redirect');
  } catch {
    /* sessionStorage unavailable */
  }
  if (!redirect) redirect = new URLSearchParams(window.location.search).get('redirect');
  return redirect && redirect.startsWith('/') ? redirect : '/';
}

/**
 * Login flow. Signs in via the auth store (which sets the httpOnly session
 * cookies), then routes: business accounts without an active business tier are
 * pushed to the membership screen, everyone else to their redirect target.
 * Surfaces the "email not verified" banner + resend on the matching error.
 */
export function useLogin() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { login } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const submit = async (email: string, password: string) => {
    if (!email.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Email and password are required' : 'E-posta ve şifre gerekli');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      toast.success(t('auth.loginSuccess'));

      try {
        const userResponse = await api.get('/users/me');
        const currentUser = userResponse.data?.user || userResponse.data;

        const membershipTier =
          currentUser?.membership?.tier?.type ||
          currentUser?.membership?.tier?.name ||
          currentUser?.membershipTier ||
          'free';
        const normalizedTier = String(membershipTier).toLowerCase();
        const isBusinessTier = normalizedTier.includes('business') || normalizedTier === 'business';

        if (
          currentUser?.isEmailVerified &&
          currentUser?.companyName &&
          currentUser?.taxId &&
          !isBusinessTier
        ) {
          router.push('/profile/membership?required=true');
          return;
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Business account check failed:', error);
        }
      }

      const target = resolveRedirect();
      setTimeout(() => {
        router.push(target);
      }, 1000);
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[Login] Login error:', error);
      }
      const message =
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (error as { message?: string })?.message ||
        t('auth.invalidCredentials');

      if (message.includes('doğrula') || message.includes('verify') || message.includes('verification')) {
        setShowVerificationBanner(true);
      }

      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async (email: string) => {
    if (!email.trim()) {
      toast.error(locale === 'en' ? 'Please enter your email first' : 'Lütfen önce e-postanızı girin');
      return;
    }

    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      toast.success(locale === 'en' ? 'Verification email sent!' : 'Doğrulama e-postası gönderildi!');
    } catch {
      toast.error(locale === 'en' ? 'Could not send email' : 'E-posta gönderilemedi');
    } finally {
      setIsResending(false);
    }
  };

  /** Redirect after a successful Google sign-in (store already updated). */
  const redirectAfterGoogle = () => router.push(resolveRedirect());

  return { submit, isLoading, showVerificationBanner, resendVerification, isResending, redirectAfterGoogle };
}
