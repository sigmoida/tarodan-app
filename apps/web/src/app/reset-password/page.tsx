'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
import { CheckIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { t, locale } = useTranslation();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState(false);

  // Password validation states
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;

  useEffect(() => {
    if (!token) {
      setTokenError(true);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid) {
      setError(locale === 'tr' ? 'Şifre gereksinimleri karşılanmıyor' : 'Password requirements not met');
      return;
    }

    if (!passwordsMatch) {
      setError(locale === 'tr' ? 'Şifreler eşleşmiyor' : 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: password,
      });
      setIsSuccess(true);
      toast.success(locale === 'tr' ? 'Şifreniz başarıyla değiştirildi!' : 'Password changed successfully!');
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      const errorMessage = error.response?.data?.message || (locale === 'tr' ? 'Şifre sıfırlama başarısız' : 'Password reset failed');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Token Error State
  if (tokenError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex flex-col">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              Tarodan
            </span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-red-500/10 p-8 md:p-10 border border-gray-100 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-rose-100 rounded-full flex items-center justify-center">
                <XCircleIcon className="w-12 h-12 text-red-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {locale === 'tr' ? 'Geçersiz Bağlantı' : 'Invalid Link'}
            </h2>
            
            <p className="text-gray-500 mb-8">
              {locale === 'tr' 
                ? 'Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş olabilir. Lütfen yeni bir bağlantı isteyin.' 
                : 'This password reset link is invalid or may have expired. Please request a new one.'}
            </p>

            <Link
              href="/forgot-password"
              className="block w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all"
            >
              {locale === 'tr' ? 'Yeni Bağlantı İste' : 'Request New Link'}
            </Link>
          </motion.div>
        </main>
      </div>
    );
  }

  // Success State
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex flex-col">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              Tarodan
            </span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-green-500/10 p-8 md:p-10 border border-gray-100 text-center"
          >
            <div className="flex justify-center mb-6">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center"
              >
                <CheckCircleIcon className="w-12 h-12 text-green-600" />
              </motion.div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {locale === 'tr' ? 'Şifreniz Değiştirildi!' : 'Password Changed!'}
            </h2>
            
            <p className="text-gray-500 mb-8">
              {locale === 'tr' 
                ? 'Şifreniz başarıyla güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.' 
                : 'Your password has been successfully updated. You can now login with your new password.'}
            </p>

            <Link
              href="/login"
              className="block w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25"
            >
              {locale === 'tr' ? 'Giriş Yap' : 'Login Now'}
            </Link>
          </motion.div>
        </main>
      </div>
    );
  }

  // Main Form
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
            Tarodan
          </span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-3xl shadow-xl shadow-orange-500/10 p-8 md:p-10 border border-gray-100">
            {/* Back Link */}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-orange-600 transition-colors mb-8 group"
            >
              <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">
                {locale === 'tr' ? 'Giriş sayfasına dön' : 'Back to login'}
              </span>
            </Link>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center">
                <ShieldCheckIcon className="w-10 h-10 text-orange-600" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {locale === 'tr' ? 'Yeni Şifre Oluştur' : 'Create New Password'}
              </h1>
              <p className="text-gray-500">
                {locale === 'tr' 
                  ? 'Güçlü bir şifre seçin ve hesabınızı güvende tutun.' 
                  : 'Choose a strong password to keep your account secure.'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {locale === 'tr' ? 'Yeni Şifre' : 'New Password'}
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-12 py-4 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-orange-500 transition-colors text-gray-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {locale === 'tr' ? 'Şifre gereksinimleri:' : 'Password requirements:'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <PasswordRequirement met={hasMinLength} text={locale === 'tr' ? 'En az 8 karakter' : 'At least 8 characters'} />
                  <PasswordRequirement met={hasUppercase} text={locale === 'tr' ? 'Büyük harf (A-Z)' : 'Uppercase (A-Z)'} />
                  <PasswordRequirement met={hasLowercase} text={locale === 'tr' ? 'Küçük harf (a-z)' : 'Lowercase (a-z)'} />
                  <PasswordRequirement met={hasNumber} text={locale === 'tr' ? 'Rakam (0-9)' : 'Number (0-9)'} />
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {locale === 'tr' ? 'Şifreyi Onayla' : 'Confirm Password'}
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    className={`w-full pl-12 pr-12 py-4 border-2 rounded-xl focus:ring-0 transition-colors text-gray-900 ${
                      confirmPassword && !passwordsMatch ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-orange-500'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                    <ExclamationCircleIcon className="w-4 h-4" />
                    {locale === 'tr' ? 'Şifreler eşleşmiyor' : 'Passwords do not match'}
                  </p>
                )}
                {passwordsMatch && (
                  <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                    <CheckCircleIcon className="w-4 h-4" />
                    {locale === 'tr' ? 'Şifreler eşleşiyor' : 'Passwords match'}
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 rounded-xl p-4"
                >
                  <p className="text-sm text-red-600 flex items-center gap-2">
                    <ExclamationCircleIcon className="w-5 h-5" />
                    {error}
                  </p>
                </motion.div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !isPasswordValid || !passwordsMatch}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {locale === 'tr' ? 'Değiştiriliyor...' : 'Changing...'}
                  </span>
                ) : (
                  locale === 'tr' ? 'Şifremi Değiştir' : 'Change Password'
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center">
        <p className="text-sm text-gray-400">
          © {new Date().getFullYear()} Tarodan. {locale === 'tr' ? 'Tüm hakları saklıdır.' : 'All rights reserved.'}
        </p>
      </footer>
    </div>
  );
}

// Password Requirement Component
function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-green-600' : 'text-gray-400'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${met ? 'bg-green-100' : 'bg-gray-100'}`}>
        {met ? <CheckIcon className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
      </div>
      <span>{text}</span>
    </div>
  );
}
