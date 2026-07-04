'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { Form, useZodForm } from '@tarodan/ui/form';
import { useTranslation } from '@/i18n/LanguageContext';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/schemas/auth';
import { useResetPassword } from '@/hooks/useResetPassword';
import { PasswordChecklist, isPasswordValid } from './PasswordChecklist';

export function ResetPasswordForm() {
  const { locale } = useTranslation();
  const { token, success, submit } = useResetPassword();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useZodForm(resetPasswordSchema(locale), {
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { register, watch, formState, setError } = form;
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = isPasswordValid(password) && passwordsMatch;
  const rootError = formState.errors.root?.message;

  const onSubmit = async (values: ResetPasswordValues) => {
    const err = await submit(values.password, locale);
    if (err) setError('root', { message: err });
  };

  // Token Error State
  if (!token) {
    return (
      <div
      className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-danger-500/10 p-8 md:p-10 border border-border-subtle text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-danger-100 to-danger-100 rounded-full flex items-center justify-center">
            <XCircleIcon className="w-12 h-12 text-danger-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-heading mb-3">
          {locale === 'tr' ? 'Geçersiz Bağlantı' : 'Invalid Link'}
        </h2>

        <p className="text-muted mb-8">
          {locale === 'tr'
            ? 'Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş olabilir. Lütfen yeni bir bağlantı isteyin.'
            : 'This password reset link is invalid or may have expired. Please request a new one.'}
        </p>

        <Link
          href="/forgot-password"
          className="block w-full py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
        >
          {locale === 'tr' ? 'Yeni Bağlantı İste' : 'Request New Link'}
        </Link>
      </div>
    );
  }

  // Success State
  if (success) {
    return (
      <div
      className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-success-500/10 p-8 md:p-10 border border-border-subtle text-center"
      >
        <div className="flex justify-center mb-6">
          <div
      className="w-20 h-20 bg-gradient-to-br from-success-100 to-success-100 rounded-full flex items-center justify-center"
          >
            <CheckCircleIcon className="w-12 h-12 text-success-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-heading mb-3">
          {locale === 'tr' ? 'Şifreniz Değiştirildi!' : 'Password Changed!'}
        </h2>

        <p className="text-muted mb-8">
          {locale === 'tr'
            ? 'Şifreniz başarıyla güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.'
            : 'Your password has been successfully updated. You can now login with your new password.'}
        </p>

        <Link
          href="/login"
          className="block w-full py-4 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 text-center"
        >
          {locale === 'tr' ? 'Giriş Yap' : 'Login Now'}
        </Link>
      </div>
    );
  }

  // Main Form
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
          <ShieldCheckIcon className="w-10 h-10 text-primary-600" />
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-heading mb-2">
          {locale === 'tr' ? 'Yeni Şifre Oluştur' : 'Create New Password'}
        </h1>
        <p className="text-muted">
          {locale === 'tr'
            ? 'Güçlü bir şifre seçin ve hesabınızı güvende tutun.'
            : 'Choose a strong password to keep your account secure.'}
        </p>
      </div>

      <Form form={form} onSubmit={onSubmit} className="space-y-5">
        {/* New Password */}
        <div>
          <label className="block text-sm font-semibold text-body mb-2">
            {locale === 'tr' ? 'Yeni Şifre' : 'New Password'}
          </label>
          <div className="relative">
            <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
            <Input
              type={showPassword ? 'text' : 'password'}
              hidePasswordToggle
              placeholder="••••••••"
              className="pl-12 pr-12 h-14 border-2 border-border rounded-xl focus:ring-0 focus:border-primary-500 transition-all duration-200 ease-premium"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={
                showPassword
                  ? locale === 'tr'
                    ? 'Şifreyi gizle'
                    : 'Hide password'
                  : locale === 'tr'
                    ? 'Şifreyi göster'
                    : 'Show password'
              }
              className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors duration-200"
            >
              {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        <PasswordChecklist password={password} locale={locale} />

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-semibold text-body mb-2">
            {locale === 'tr' ? 'Şifreyi Onayla' : 'Confirm Password'}
          </label>
          <div className="relative">
            <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              hidePasswordToggle
              placeholder="••••••••"
              className={`pl-12 pr-12 h-14 border-2 rounded-xl focus:ring-0 transition-all duration-200 ease-premium ${
                confirmPassword && !passwordsMatch
                  ? 'border-danger-300 bg-danger-50'
                  : 'border-border focus:border-primary-500'
              }`}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={
                showConfirmPassword
                  ? locale === 'tr'
                    ? 'Şifreyi gizle'
                    : 'Hide password'
                  : locale === 'tr'
                    ? 'Şifreyi göster'
                    : 'Show password'
              }
              className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors duration-200"
            >
              {showConfirmPassword ? (
                <EyeSlashIcon className="w-5 h-5" />
              ) : (
                <EyeIcon className="w-5 h-5" />
              )}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="mt-2 text-sm text-danger-600 flex items-center gap-1">
              <ExclamationCircleIcon className="w-4 h-4" />
              {locale === 'tr' ? 'Şifreler eşleşmiyor' : 'Passwords do not match'}
            </p>
          )}
          {passwordsMatch && (
            <p className="mt-2 text-sm text-success-600 flex items-center gap-1">
              <CheckCircleIcon className="w-4 h-4" />
              {locale === 'tr' ? 'Şifreler eşleşiyor' : 'Passwords match'}
            </p>
          )}
        </div>

        {/* Error Message */}
        {rootError && (
          <div
      className="bg-danger-50 border border-danger-200 rounded-xl p-4"
          >
            <p className="text-sm text-danger-600 flex items-center gap-2">
              <ExclamationCircleIcon className="w-5 h-5" />
              {rootError}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          variant="secondary"
          type="submit"
          disabled={formState.isSubmitting || !canSubmit}
          className="w-full py-4 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 disabled:bg-border-strong disabled:cursor-not-allowed transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
        >
          {formState.isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {locale === 'tr' ? 'Değiştiriliyor...' : 'Changing...'}
            </span>
          ) : locale === 'tr' ? (
            'Şifremi Değiştir'
          ) : (
            'Change Password'
          )}
        </Button>
      </Form>
    </div>
  );
}
