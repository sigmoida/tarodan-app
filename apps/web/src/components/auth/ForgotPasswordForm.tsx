'use client';

import Link from 'next/link';
import {
  EnvelopeIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { Form, useZodForm } from '@tarodan/ui/form';
import { useTranslation } from '@/i18n';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/schemas/auth';
import { useForgotPassword } from '@/hooks/useForgotPassword';

export function ForgotPasswordForm() {
  const { locale } = useTranslation();
  const { submit, sent, reset } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema(locale), { defaultValues: { email: '' } });
  const { register, formState, getValues } = form;
  const error = formState.errors.email?.message;

  const onSubmit = (values: ForgotPasswordValues) => submit(values.email);

  if (sent) {
    return (
      <div
      className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-success-500/10 p-8 md:p-10 border border-border-subtle text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-success-100 to-success-100 rounded-full flex items-center justify-center">
            <CheckCircleIcon className="w-12 h-12 text-success-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-heading mb-3">
          {locale === 'tr' ? 'E-posta Gönderildi!' : 'Email Sent!'}
        </h2>

        <p className="text-muted mb-2">
          {locale === 'tr'
            ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
            : 'A password reset link has been sent to your email.'}
        </p>

        <p className="text-sm text-subtle mb-8">
          <strong className="text-muted">{getValues('email')}</strong>
        </p>

        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-warning-800">
            💡{' '}
            {locale === 'tr'
              ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin.'
              : "Can't find the email? Check your spam/junk folder."}
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
          >
            {locale === 'tr' ? 'Giriş Sayfasına Dön' : 'Back to Login'}
          </Link>

          <Button
            variant="secondary"
            onClick={reset}
            className="block w-full py-3 bg-surface-alt text-body font-medium rounded-xl hover:bg-border-subtle transition-all duration-200 ease-premium"
          >
            {locale === 'tr' ? 'Farklı E-posta Dene' : 'Try Different Email'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-primary-500/10 p-8 md:p-10 border border-border-subtle"
    >
      <Link
        href="/login"
        className="inline-flex items-center gap-2 text-muted hover:text-primary-600 transition-colors duration-200 mb-8 group"
      >
        <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" />
        <span className="text-sm font-medium">
          {locale === 'tr' ? 'Giriş sayfasına dön' : 'Back to login'}
        </span>
      </Link>

      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-warning-100 rounded-2xl flex items-center justify-center">
          <LockClosedIcon className="w-10 h-10 text-primary-600" />
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-heading mb-2">
          {locale === 'tr' ? 'Şifrenizi mi unuttunuz?' : 'Forgot your password?'}
        </h1>
        <p className="text-muted">
          {locale === 'tr'
            ? 'Endişelenmeyin! E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'
            : "Don't worry! Enter your email and we'll send you a reset link."}
        </p>
      </div>

      <Form form={form} onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-body mb-2">
            {locale === 'tr' ? 'E-posta Adresi' : 'Email Address'}
          </label>
          <div className="relative">
            <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
            <Input
              type="email"
              placeholder="ornek@email.com"
              autoFocus
              className={`pl-12 pr-4 h-14 border-2 rounded-xl focus:ring-0 focus:border-primary-500 transition-all duration-200 ease-premium ${
                error ? 'border-danger-300 bg-danger-50' : 'border-border'
              }`}
              {...register('email')}
            />
          </div>
          {error && (
            <p
      className="mt-2 text-sm text-danger-600 flex items-center gap-1"
            >
              <ExclamationCircleIcon className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>

        <Button
          variant="secondary"
          type="submit"
          disabled={formState.isSubmitting}
          className="w-full py-4 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 disabled:bg-border-strong disabled:cursor-not-allowed transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
        >
          {formState.isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {locale === 'tr' ? 'Gönderiliyor...' : 'Sending...'}
            </span>
          ) : locale === 'tr' ? (
            'Sıfırlama Bağlantısı Gönder'
          ) : (
            'Send Reset Link'
          )}
        </Button>
      </Form>

      <p className="mt-6 text-center text-sm text-muted">
        {locale === 'tr' ? 'Hesabınız yok mu?' : "Don't have an account?"}{' '}
        <Link
          href="/register"
          className="text-primary-600 hover:text-primary-700 font-semibold transition-colors duration-200"
        >
          {locale === 'tr' ? 'Kayıt olun' : 'Sign up'}
        </Link>
      </p>
    </div>
  );
}
