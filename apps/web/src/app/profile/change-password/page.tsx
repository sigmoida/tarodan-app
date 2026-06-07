'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useTranslation } from '@/i18n/LanguageContext';import { Button, Input } from '@tarodan/ui';


function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-success-600' : 'text-subtle'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${met ? 'bg-success-100' : 'bg-surface-alt'}`}>
        {met ? <CheckIcon className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-border-strong" />}
      </div>
      <span>{text}</span>
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t, locale } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const isNewPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/change-password');
      return;
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!currentPassword.trim()) {
      setError(locale === 'tr' ? 'Mevcut şifrenizi girin' : 'Enter your current password');
      return;
    }
    if (!isNewPasswordValid) {
      setError(locale === 'tr' ? 'Yeni şifre gereksinimleri karşılanmıyor' : 'New password does not meet requirements');
      return;
    }
    if (!passwordsMatch) {
      setError(locale === 'tr' ? 'Yeni şifreler eşleşmiyor' : 'New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/security/password/change', {
        currentPassword: currentPassword.trim(),
        newPassword,
      });
      setSuccess(true);
      toast.success(t('settings.passwordChanged'));
    } catch (err: any) {
      const msg = err.response?.data?.message || (locale === 'tr' ? 'Şifre değiştirilemedi' : 'Failed to change password');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
        <div className="bg-gradient-to-r from-primary-500 to-warning-500 text-inverted">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <Link
              href="/profile/settings"
              className="inline-flex items-center gap-2 text-inverted/80 hover:text-inverted mb-4 transition-colors group"
            >
              <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">{locale === 'en' ? 'Back to Settings' : 'Ayarlara Dön'}</span>
            </Link>
          </div>
        </div>
        <main className="max-w-4xl mx-auto px-4 py-12 -mt-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle p-8 md:p-10 text-center"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-success-100 to-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircleIcon className="w-12 h-12 text-success-600" />
            </div>
            <h2 className="text-2xl font-bold text-heading mb-2">{t('settings.passwordChanged')}</h2>
            <p className="text-muted mb-8">
              {locale === 'tr'
                ? 'Şifreniz güncellendi. Bir sonraki girişte yeni şifrenizi kullanın.'
                : 'Your password has been updated. Use your new password on next login.'}
            </p>
            <Link
              href="/profile/settings"
              className="inline-flex items-center gap-2 py-3 px-6 bg-gradient-to-r from-primary-500 to-warning-500 text-inverted font-semibold rounded-xl hover:from-primary-600 hover:to-warning-600 transition-all"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              {locale === 'en' ? 'Back to Settings' : 'Ayarlara Dön'}
            </Link>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
      <div className="bg-gradient-to-r from-primary-500 to-warning-500 text-inverted">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            href="/profile/settings"
            className="inline-flex items-center gap-2 text-inverted/80 hover:text-inverted mb-4 transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">{locale === 'en' ? 'Back to Settings' : 'Ayarlara Dön'}</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-elevated/20 flex items-center justify-center">
              <KeyIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{t('settings.changePassword')}</h1>
              <p className="text-inverted/80 mt-1">
                {locale === 'tr' ? 'Mevcut şifrenizi girip yeni şifre belirleyin' : 'Enter your current password and set a new one'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8 -mt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border-subtle bg-surface/50">
            <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
              <LockClosedIcon className="w-5 h-5 text-primary-500" />
              {t('settings.changePassword')}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('settings.currentPassword')}
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                <Input type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3 border-2 border-border rounded-xl focus:ring-0 focus:border-primary-500 transition-colors text-heading"
                  required
                  autoComplete="current-password" />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  aria-label={showCurrent ? (locale === 'tr' ? 'Şifreyi gizle' : 'Hide password') : (locale === 'tr' ? 'Şifreyi göster' : 'Show password')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted">
                  {showCurrent ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('settings.newPassword')}
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                <Input type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3 border-2 border-border rounded-xl focus:ring-0 focus:border-primary-500 transition-colors text-heading"
                  required
                  autoComplete="new-password" />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  aria-label={showNew ? (locale === 'tr' ? 'Şifreyi gizle' : 'Hide password') : (locale === 'tr' ? 'Şifreyi göster' : 'Show password')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted">
                  {showNew ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="bg-surface rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-muted mb-2">
                {locale === 'tr' ? 'Yeni şifre gereksinimleri:' : 'New password requirements:'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <PasswordRequirement met={hasMinLength} text={locale === 'tr' ? 'En az 8 karakter' : 'At least 8 characters'} />
                <PasswordRequirement met={hasUppercase} text={locale === 'tr' ? 'Büyük harf (A-Z)' : 'Uppercase (A-Z)'} />
                <PasswordRequirement met={hasLowercase} text={locale === 'tr' ? 'Küçük harf (a-z)' : 'Lowercase (a-z)'} />
                <PasswordRequirement met={hasNumber} text={locale === 'tr' ? 'Rakam (0-9)' : 'Number (0-9)'} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('settings.confirmNewPassword')}
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                <Input type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  className={`w-full pl-12 pr-12 py-3 border-2 rounded-xl focus:ring-0 transition-colors text-heading ${
                    confirmPassword && !passwordsMatch ? 'border-danger-300 bg-danger-50' : 'border-border focus:border-primary-500'
                  }`}
                  required
                  autoComplete="new-password" />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? (locale === 'tr' ? 'Şifreyi gizle' : 'Hide password') : (locale === 'tr' ? 'Şifreyi göster' : 'Show password')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted">
                  {showConfirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
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

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-danger-50 border border-danger-200 rounded-xl p-4"
              >
                <p className="text-sm text-danger-600 flex items-center gap-2">
                  <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
                  {error}
                </p>
              </motion.div>
            )}

            <Button variant="secondary" type="submit"
              disabled={loading || !currentPassword.trim() || !isNewPasswordValid || !passwordsMatch}
              className="w-full py-4 bg-gradient-to-r from-primary-500 to-warning-500 text-inverted font-semibold rounded-xl hover:from-primary-600 hover:to-warning-600 disabled:from-border-strong disabled:to-subtle disabled:cursor-not-allowed transition-all">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {locale === 'tr' ? 'Değiştiriliyor...' : 'Changing...'}
                </span>
              ) : (
                t('settings.changePassword')
              )}
            </Button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
