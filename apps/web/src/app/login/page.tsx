'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
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

  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
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
      
      try {
        const userResponse = await api.get('/users/me');
        const currentUser = userResponse.data?.user || userResponse.data;
        
        const membershipTier = currentUser?.membership?.tier?.type || 
                               currentUser?.membership?.tier?.name || 
                               currentUser?.membershipTier || 
                               'free';
        const normalizedTier = String(membershipTier).toLowerCase();
        const isBusinessTier = normalizedTier.includes('business') || normalizedTier === 'business';
        
        if (currentUser?.isEmailVerified && 
            currentUser?.companyName && 
            currentUser?.taxId &&
            !isBusinessTier) {
          router.push('/profile/membership?required=true');
          return;
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Business account check failed:', error);
        }
      }
      
      let redirect: string | null = null;
      try {
        redirect = sessionStorage.getItem('login_redirect');
        if (redirect) sessionStorage.removeItem('login_redirect');
      } catch (_) {}
      if (!redirect) redirect = new URLSearchParams(window.location.search).get('redirect');
      const target = redirect && redirect.startsWith('/') ? redirect : '/';
      
      setTimeout(() => {
        router.push(target);
      }, 1000);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Login] Login error:', error);
      }
      const message = error.response?.data?.message || error.message || t('auth.invalidCredentials');
      
      if (message.includes('doğrula') || message.includes('verify') || message.includes('verification')) {
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

  const stagger = {
    container: {
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
      },
    },
    item: {
      hidden: { opacity: 0, y: 10 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
    },
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="px-6 pt-6">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={36} height={36} className="rounded-lg object-contain" />
            <span className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
              Tarodan
            </span>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {locale === 'en' ? 'Sign in to your account' : 'Hesabınıza giriş yapın'}
            </p>
          </div>

          {showVerificationBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-6"
            >
              <div className="flex gap-3 mb-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <p className="text-sm font-medium text-amber-900">
                  {locale === 'en' 
                    ? 'Your email is not verified yet. Please check your inbox or spam folder for the verification link.' 
                    : 'E-postanız henüz doğrulanmadı. Gelen kutunuzu veya spam klasörünüzü kontrol edin.'}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="w-full py-2.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold text-sm rounded-lg transition-all duration-200 ease-premium disabled:opacity-50"
                >
                  {isResending 
                    ? (locale === 'en' ? 'Sending...' : 'Gönderiliyor...') 
                    : (locale === 'en' ? 'Resend verification email' : 'Doğrulama E-postasını Tekrar Gönder')}
                </button>
                <Link
                  href="/verify-email"
                  className="block w-full py-2 text-center text-sm text-amber-800 hover:text-amber-900 underline transition-colors duration-200"
                >
                  {locale === 'en' ? 'Go to verification page' : 'Doğrulama sayfasına git'}
                </Link>
              </div>
            </motion.div>
          )}

          <div className="border border-gray-200 bg-white rounded-xl p-7">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <motion.div
                variants={stagger.container}
                initial="hidden"
                animate="show"
                className="space-y-5"
              >
                <motion.div variants={stagger.item}>
                  <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 outline-none transition-all duration-200 ease-premium"
                      autoComplete="email"
                    />
                  </div>
                </motion.div>

                <motion.div variants={stagger.item}>
                  <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 outline-none transition-all duration-200 ease-premium"
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-[18px] h-[18px]" />
                      ) : (
                        <EyeIcon className="w-[18px] h-[18px]" />
                      )}
                    </button>
                  </div>
                </motion.div>

                <motion.div variants={stagger.item} className="flex items-center justify-between">
                  <label htmlFor="login-remember" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="login-remember"
                      type="checkbox"
                      className="w-4 h-4 rounded-sm border-gray-300 text-primary-500 focus:ring-primary-500 transition-colors duration-200"
                    />
                    <span className="text-sm text-gray-600">{t('auth.rememberMe')}</span>
                  </label>
                  <Link href="/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors duration-200">
                    {t('auth.forgotPassword')}
                  </Link>
                </motion.div>

                <motion.div variants={stagger.item}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-lg bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 active:bg-primary-700 transition-all duration-200 ease-premium disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isLoading && (
                      <svg className="animate-spin h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {isLoading 
                      ? (locale === 'en' ? 'Signing in...' : 'Giriş yapılıyor...') 
                      : t('common.login')}
                  </button>
                </motion.div>
              </motion.div>
            </form>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="text-center mt-6 text-sm text-gray-500"
          >
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors duration-200">
              {t('common.register')}
            </Link>
          </motion.p>
        </motion.div>
        </div>
      </div>

      {/* Right - Image panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <Image
          src="/photos/hero/hero-marketplace.png"
          alt="Diecast model araba koleksiyonu"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/50 to-black/20" />
        <div className="absolute inset-0 flex items-center justify-center p-10 z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">
              {locale === 'en' 
                ? 'The Meeting Point for Collectors'
                : 'Koleksiyonerlerin Buluşma Noktası'}
            </h2>
            <p className="text-sm text-white/80 max-w-md drop-shadow">
              {locale === 'en'
                ? 'Find what you\'re looking for among thousands of diecast models.'
                : 'Binlerce diecast model arasından aradığınızı bulun.'}
            </p>
            <div className="flex items-center gap-6 mt-5">
              <div>
                <p className="text-lg font-bold text-white drop-shadow">10K+</p>
                <p className="text-xs text-white/60">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div className="w-px h-6 bg-white/30" />
              <div>
                <p className="text-lg font-bold text-white drop-shadow">5K+</p>
                <p className="text-xs text-white/60">{locale === 'en' ? 'Members' : 'Üye'}</p>
              </div>
              <div className="w-px h-6 bg-white/30" />
              <div>
                <p className="text-lg font-bold text-white drop-shadow">2K+</p>
                <p className="text-xs text-white/60">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
