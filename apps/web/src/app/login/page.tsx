'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, ExclamationTriangleIcon, ShieldCheckIcon, ArrowsRightLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { login, isAuthenticated, user } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Redirect if already authenticated (prefer sessionStorage so redirect is not lost when URL is stripped)
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      // Don't auto-redirect if we're in the middle of login process
      // The login handler will handle redirect after business check
      return;
    }
  }, [isAuthenticated]);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Email and password are required' : 'E-posta ve şifre gerekli');
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      toast.success(t('auth.loginSuccess'));
      
      // Check for business account warning BEFORE redirect
      try {
        const userResponse = await api.get('/users/me');
        const currentUser = userResponse.data?.user || userResponse.data;
        
        // Extract membership tier (handle different formats)
        const membershipTier = currentUser?.membership?.tier?.type || 
                               currentUser?.membership?.tier?.name || 
                               currentUser?.membershipTier || 
                               'free';
        const normalizedTier = String(membershipTier).toLowerCase();
        const isBusinessTier = normalizedTier.includes('business') || normalizedTier === 'business';
        
        // Check if business account needs membership - FORCE redirect to membership page
        if (currentUser?.isEmailVerified && 
            currentUser?.companyName && 
            currentUser?.taxId &&
            !isBusinessTier) {
          // Force redirect to membership page - don't allow navigation elsewhere
          router.push('/profile/membership?required=true');
          return; // Don't continue with normal redirect
        }
      } catch (error) {
        // Ignore errors in business check, continue with redirect
        if (process.env.NODE_ENV === 'development') {
          console.error('Business account check failed:', error);
        }
      }
      
      // Get redirect URL
      let redirect: string | null = null;
      try {
        redirect = sessionStorage.getItem('login_redirect');
        if (redirect) sessionStorage.removeItem('login_redirect');
      } catch (_) {}
      if (!redirect) redirect = new URLSearchParams(window.location.search).get('redirect');
      const target = redirect && redirect.startsWith('/') ? redirect : '/';
      
      // Small delay to ensure toast is shown before redirect
      setTimeout(() => {
        router.push(target);
      }, 1000);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Login] Login error:', error);
      }
      const message = error.response?.data?.message || error.message || t('auth.invalidCredentials');
      
      // Check if error is about unverified email
      if (message.includes('doğrulayın') || message.includes('verify')) {
        setShowVerificationBanner(true);
      }
      
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      toast.error(locale === 'en' ? 'Please enter your email first' : 'Lütfen önce e-postanızı girin');
      return;
    }
    
    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      toast.success(locale === 'en' ? 'Verification email sent!' : 'Doğrulama e-postası gönderildi!');
    } catch (error) {
      toast.error(locale === 'en' ? 'Could not send email' : 'E-posta gönderilemedi');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="mb-10 flex flex-col items-center">
            <Link href="/" className="inline-flex items-center justify-center mb-6">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan"
                width={128}
                height={128}
                className="rounded-xl object-contain"
              />
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {t('auth.welcomeBack')}
            </h1>
          </div>

          {/* Email verification banner */}
          {showVerificationBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3"
            >
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800 mb-2">
                  {locale === 'en' 
                    ? 'Your email is not verified yet. Please check your inbox for the verification link.' 
                    : 'E-postanız henüz doğrulanmadı. Lütfen gelen kutunuzdaki doğrulama linkine tıklayın.'}
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="text-sm font-semibold text-amber-700 hover:text-amber-800 underline disabled:opacity-50"
                >
                  {isResending 
                    ? (locale === 'en' ? 'Sending...' : 'Gönderiliyor...') 
                    : (locale === 'en' ? 'Resend verification email' : 'Doğrulama e-postasını tekrar gönder')}
                </button>
              </div>
            </motion.div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-soft p-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="space-y-5"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                    className="input pl-12 border-2 border-gray-200 focus:border-primary-500 bg-white shadow-sm"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-12 pr-12 border-2 border-gray-200 focus:border-primary-500 bg-white shadow-sm"
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600 font-medium">{t('auth.rememberMe')}</span>
                </label>
                <Link href="/forgot-password" className="text-sm font-medium text-primary-500 hover:text-primary-600">
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-3 text-sm font-semibold tracking-tight"
              >
                {isLoading 
                  ? (locale === 'en' ? 'Signing in...' : 'Giriş yapılıyor...') 
                  : t('common.login')}
              </button>
            </form>
          </div>

          <p className="text-center mt-8 text-sm text-gray-500">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="font-medium text-primary-500 hover:text-primary-600">
              {t('common.register')}
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right - Brand panel */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-12 right-12 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-16 left-16 w-48 h-48 rounded-full bg-white/5 blur-2xl" />
        <div className="max-w-sm text-white relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
                {locale === 'en' 
                  ? 'The Meeting Point for Collectors'
                  : 'Koleksiyonerlerin Buluşma Noktası'}
              </h2>
              <p className="text-sm text-white/60 leading-relaxed">
                {locale === 'en'
                  ? 'Find what you\'re looking for among thousands of diecast models. Buy, sell, or trade with confidence.'
                  : 'Binlerce diecast model arasından aradığınızı bulun. Güvenle alın, satın veya takas yapın.'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldCheckIcon className="w-5 h-5 text-white/80" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{locale === 'en' ? 'Secure Shopping' : 'Güvenli Alışveriş'}</p>
                  <p className="text-xs text-white/50">{locale === 'en' ? 'Protected payments and buyer guarantee' : 'Korumalı ödeme ve alıcı garantisi'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ArrowsRightLeftIcon className="w-5 h-5 text-white/80" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{locale === 'en' ? 'Easy Trading' : 'Kolay Takas'}</p>
                  <p className="text-xs text-white/50">{locale === 'en' ? 'Trade models with other collectors safely' : 'Diğer koleksiyonerlerle güvenle takas yapın'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <SparklesIcon className="w-5 h-5 text-white/80" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{locale === 'en' ? 'Premium Collections' : 'Premium Koleksiyonlar'}</p>
                  <p className="text-xs text-white/50">{locale === 'en' ? 'Showcase and discover rare diecast models' : 'Nadir diecast modelleri sergileyin ve keşfedin'}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
