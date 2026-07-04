'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  EnvelopeIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Button, Checkbox, Input } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useLogin } from '@/hooks/useLogin';


export function LoginForm() {
  const { t, locale } = useTranslation();
  const {
    submit,
    isLoading,
    showVerificationBanner,
    resendVerification,
    isResending,
    redirectAfterGoogle,
  } = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="flex-1 flex flex-col bg-surface-elevated">
        <div className="px-6 pt-6">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={162} height={40} className="rounded-lg object-contain" />
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div
      className="w-full max-w-[400px]"
          >
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-heading tracking-tight">{t('auth.welcomeBack')}</h1>
              <p className="text-sm text-muted mt-1">
                {locale === 'en' ? 'Sign in to your account' : 'Hesabınıza giriş yapın'}
              </p>
            </div>

            {showVerificationBanner && (
              <div
      className="bg-warning-50 border-2 border-warning-300 rounded-xl p-5 mb-6"
              >
                <div className="flex gap-3 mb-3">
                  <ExclamationTriangleIcon className="w-6 h-6 text-warning-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-warning-900">
                    {locale === 'en'
                      ? 'Your email is not verified yet. Please check your inbox or spam folder for the verification link.'
                      : 'E-postanız henüz doğrulanmadı. Gelen kutunuzu veya spam klasörünüzü kontrol edin.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => resendVerification(email)}
                    disabled={isResending}
                    className="w-full py-2.5 bg-warning-200 hover:bg-warning-300 text-warning-900 font-semibold text-sm rounded-lg transition-all duration-200 ease-premium disabled:opacity-50"
                  >
                    {isResending
                      ? locale === 'en'
                        ? 'Sending...'
                        : 'Gönderiliyor...'
                      : locale === 'en'
                        ? 'Resend verification email'
                        : 'Doğrulama E-postasını Tekrar Gönder'}
                  </Button>
                  <Link
                    href="/verify-email"
                    className="block w-full py-2 text-center text-sm text-warning-800 hover:text-warning-900 underline transition-colors duration-200"
                  >
                    {locale === 'en' ? 'Go to verification page' : 'Doğrulama sayfasına git'}
                  </Link>
                </div>
              </div>
            )}

            <div className="border border-border bg-surface-elevated rounded-xl p-7">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(email, password);
                }}
              >
                <div className="space-y-5">
                  <div>
                    <label htmlFor="login-email" className="block text-sm font-medium text-body mb-1.5">
                      {t('auth.email')}
                    </label>
                    <div className="relative">
                      <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-subtle pointer-events-none" />
                      <Input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                        className="pl-10 pr-4 bg-surface focus:bg-surface-elevated transition-all duration-200 ease-premium"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-sm font-medium text-body mb-1.5">
                      {t('auth.password')}
                    </label>
                    <div className="relative">
                      <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-subtle pointer-events-none" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        hidePasswordToggle
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 pr-10 bg-surface focus:bg-surface-elevated transition-all duration-200 ease-premium"
                        autoComplete="current-password"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submit(email, password);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword
                            ? locale === 'en'
                              ? 'Hide password'
                              : 'Şifreyi gizle'
                            : locale === 'en'
                              ? 'Show password'
                              : 'Şifreyi göster'
                        }
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors duration-200"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="w-[18px] h-[18px]" />
                        ) : (
                          <EyeIcon className="w-[18px] h-[18px]" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Checkbox id="login-remember" className="rounded-sm transition-colors duration-200" label={t('auth.rememberMe')} />
                    <Link
                      href="/forgot-password"
                      className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors duration-200"
                    >
                      {t('auth.forgotPassword')}
                    </Link>
                  </div>

                  <div>
                    <Button
                      variant="secondary"
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-lg bg-primary-500 text-inverted font-semibold text-sm hover:bg-primary-600 active:bg-primary-700 transition-all duration-200 ease-premium disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
                    >
                      {isLoading && (
                        <svg className="animate-spin h-4 w-4 text-inverted/80" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {isLoading
                        ? locale === 'en'
                          ? 'Signing in...'
                          : 'Giriş yapılıyor...'
                        : t('common.login')}
                    </Button>
                  </div>
                </div>
              </form>

              <div className="mt-4">
                <GoogleSignInButton onSuccess={redirectAfterGoogle} />
              </div>
            </div>

            <p
      className="text-center mt-6 text-sm text-muted"
            >
              {t('auth.noAccount')}{' '}
              <Link href="/register" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors duration-200">
                {t('common.register')}
              </Link>
            </p>
          </div>
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
        <div className="absolute inset-0 bg-gradient-to-t from-heading/70 via-heading/50 to-heading/20" />
        <div className="absolute inset-0 flex items-center justify-center p-10 z-10">
          <div

           
          >
            <h2 className="text-2xl font-bold text-inverted mb-2 drop-shadow-lg">
              {locale === 'en' ? 'The Meeting Point for Collectors' : 'Koleksiyonerlerin Buluşma Noktası'}
            </h2>
            <p className="text-sm text-inverted/80 max-w-md drop-shadow">
              {locale === 'en'
                ? "Find what you're looking for among thousands of diecast models."
                : 'Binlerce diecast model arasından aradığınızı bulun.'}
            </p>
            <div className="flex items-center gap-6 mt-5">
              <div>
                <p className="text-lg font-bold text-inverted drop-shadow">10K+</p>
                <p className="text-xs text-inverted/60">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div className="w-px h-6 bg-surface-elevated/30" />
              <div>
                <p className="text-lg font-bold text-inverted drop-shadow">5K+</p>
                <p className="text-xs text-inverted/60">{locale === 'en' ? 'Members' : 'Üye'}</p>
              </div>
              <div className="w-px h-6 bg-surface-elevated/30" />
              <div>
                <p className="text-lg font-bold text-inverted drop-shadow">2K+</p>
                <p className="text-xs text-inverted/60">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
