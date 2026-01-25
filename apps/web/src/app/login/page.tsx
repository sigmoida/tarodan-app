'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { login, isAuthenticated } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[Login] Already authenticated, redirecting...');
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      router.push(redirect || '/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Email and password are required' : 'E-posta ve şifre gerekli');
      return;
    }

    setIsLoading(true);
    console.log('[Login] Attempting login with:', email);
    
    try {
      await login(email, password);
      console.log('[Login] Login successful!');
      toast.success(t('auth.loginSuccess'));
      // Use window.location for reliable redirect
      window.location.href = '/';
    } catch (error: any) {
      console.error('[Login] Login error:', error);
      const message = error.response?.data?.message || error.message || t('auth.invalidCredentials');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8">
              <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">🚗</span>
              </div>
              <span className="font-display font-bold text-2xl">
                TARODAN
              </span>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-gray-600">
              {locale === 'en' ? 'Sign in to your account' : 'Hesabınıza giriş yapın'}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-6"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email')}
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                  className="input pl-12"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-12 pr-12"
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
                <span className="text-sm text-gray-600">{t('auth.rememberMe')}</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-primary-500 hover:text-primary-600">
                {t('auth.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading 
                ? (locale === 'en' ? 'Signing in...' : 'Giriş yapılıyor...') 
                : t('common.login')}
            </button>
          </form>

          <p className="text-center mt-8 text-gray-600">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="text-primary-500 font-semibold hover:text-primary-600">
              {t('common.register')}
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right - Hero */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-12">
        <div className="max-w-lg text-white text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-8xl mb-8">🏎️</div>
            <h2 className="text-3xl font-bold mb-4">
              {locale === 'en' 
                ? 'The Meeting Point for Collectors'
                : 'Koleksiyonerlerin Buluşma Noktası'}
            </h2>
            <p className="text-gray-300 text-lg">
              {locale === 'en'
                ? 'Find what you\'re looking for among thousands of diecast models. Buy, sell, or trade with confidence.'
                : 'Binlerce diecast model arasından aradığınızı bulun. Güvenle alın, satın veya takas yapın.'}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
