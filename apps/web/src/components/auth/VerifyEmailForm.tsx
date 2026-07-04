'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircleIcon,
  XCircleIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';

export function VerifyEmailForm() {
  const { locale } = useTranslation();
  const { status, errorMessage, resend, resendLoading, resendSuccess } = useVerifyEmail(locale);
  const [resendEmail, setResendEmail] = useState('');

  const onResend = (e: React.FormEvent) => {
    e.preventDefault();
    resend(resendEmail);
  };

  const resendForm = (
    <form onSubmit={onResend} className="mb-6 space-y-3">
      <Input
        type="email"
        value={resendEmail}
        onChange={(e) => setResendEmail(e.target.value)}
        placeholder={locale === 'tr' ? 'E-posta adresiniz' : 'Your email'}
        className="px-4 py-3 border-border rounded-xl transition-all duration-200 ease-premium text-heading"
        required
      />
      <Button
        variant="secondary"
        type="submit"
        disabled={resendLoading}
        className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-subtle text-inverted font-semibold rounded-xl transition-all duration-200 ease-premium flex items-center justify-center gap-2"
      >
        {resendLoading ? (
          <ArrowPathIcon className="w-5 h-5 animate-spin" />
        ) : locale === 'tr' ? (
          'Yeniden doğrulama e-postası gönder'
        ) : (
          'Resend verification email'
        )}
      </Button>
      {resendSuccess && (
        <p className="text-sm text-success-600 text-center">
          {locale === 'tr'
            ? 'E-posta gönderildi. Gelen kutunuzu kontrol edin.'
            : 'Email sent. Check your inbox.'}
        </p>
      )}
    </form>
  );

  return (
    <div
      className="w-full max-w-md"
    >
      {status === 'loading' && (
        <div className="bg-surface-elevated rounded-3xl shadow-xl shadow-primary-500/10 p-8 md:p-10 border border-border-subtle text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-warning-100 rounded-full flex items-center justify-center">
              <ArrowPathIcon className="w-10 h-10 text-primary-600 animate-spin" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-heading mb-3">
            {locale === 'tr' ? 'E-posta Doğrulanıyor...' : 'Verifying Email...'}
          </h2>
          <p className="text-muted">{locale === 'tr' ? 'Lütfen bekleyin...' : 'Please wait...'}</p>
        </div>
      )}

      {status === 'success' && (
        <div
      className="bg-surface-elevated rounded-3xl shadow-xl shadow-success-500/10 p-8 md:p-10 border border-border-subtle text-center"
        >
          <div className="flex justify-center mb-6">
            <div
      className="w-20 h-20 bg-gradient-to-br from-success-100 to-success-100 rounded-full flex items-center justify-center"
            >
              <CheckCircleIcon className="w-12 h-12 text-success-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-heading mb-3">
            {locale === 'tr' ? 'E-posta Doğrulandı!' : 'Email Verified!'}
          </h2>

          <p className="text-muted mb-8">
            {locale === 'tr'
              ? 'E-posta adresiniz başarıyla doğrulandı. Artık hesabınıza giriş yapabilirsiniz.'
              : 'Your email has been successfully verified. You can now login to your account.'}
          </p>

          <Link
            href="/login"
            className="block w-full py-4 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 text-center"
          >
            {locale === 'tr' ? 'Giriş Yap' : 'Login Now'}
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div
      className="bg-surface-elevated rounded-3xl shadow-xl shadow-danger-500/10 p-8 md:p-10 border border-border-subtle text-center"
        >
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-danger-100 to-danger-100 rounded-full flex items-center justify-center">
              <XCircleIcon className="w-12 h-12 text-danger-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-heading mb-3">
            {locale === 'tr' ? 'Doğrulama Başarısız' : 'Verification Failed'}
          </h2>

          <p className="text-muted mb-4">{errorMessage}</p>

          <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-warning-800">
              {locale === 'tr'
                ? 'Bağlantının süresi dolmuş olabilir. Yeni bir doğrulama e-postası isteyebilirsiniz.'
                : 'The link may have expired. You can request a new verification email.'}
            </p>
          </div>

          {resendForm}

          <div className="space-y-3">
            <Link
              href="/login"
              className="block w-full py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
            >
              {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
            </Link>

            <Link
              href="/register"
              className="block w-full py-3 bg-surface-alt text-body font-medium rounded-xl hover:bg-border-subtle transition-all duration-200 ease-premium text-center"
            >
              {locale === 'tr' ? 'Yeniden Kayıt Ol' : 'Register Again'}
            </Link>
          </div>
        </div>
      )}

      {status === 'no-token' && (
        <div
      className="bg-surface-elevated rounded-3xl shadow-xl shadow-primary-500/10 p-8 md:p-10 border border-border-subtle text-center"
        >
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-warning-100 rounded-2xl flex items-center justify-center">
              <EnvelopeIcon className="w-10 h-10 text-primary-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-heading mb-3">
            {locale === 'tr' ? 'E-posta Doğrulama' : 'Email Verification'}
          </h2>

          <p className="text-muted mb-8">
            {locale === 'tr'
              ? 'E-postanızdaki doğrulama linkine tıklayarak hesabınızı aktifleştirin.'
              : 'Click the verification link in your email to activate your account.'}
          </p>

          <div className="bg-info-50 border border-info-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-info-800">
              {locale === 'tr'
                ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin veya yeni doğrulama e-postası isteyin.'
                : "Can't find the email? Check your spam/junk folder or request a new verification email."}
            </p>
          </div>

          {resendForm}

          <div className="space-y-3">
            <Link
              href="/login"
              className="block w-full py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
            >
              {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
