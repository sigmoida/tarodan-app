'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { 
  EnvelopeIcon, 
  ArrowLeftIcon, 
  CheckCircleIcon,
  ExclamationCircleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';

export default function ForgotPasswordPage() {
  const { t, locale } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError(locale === 'tr' ? 'E-posta adresi gerekli' : 'Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError(locale === 'tr' ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setIsSubmitted(true);
    } catch (error: any) {
      console.error('Failed to request password reset:', error);
      // Always show success for security reasons
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

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
          {!isSubmitted ? (
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
                  <LockClosedIcon className="w-10 h-10 text-orange-600" />
                </div>
              </div>

              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                  {locale === 'tr' ? 'Şifrenizi mi unuttunuz?' : 'Forgot your password?'}
                </h1>
                <p className="text-gray-500">
                  {locale === 'tr' 
                    ? 'Endişelenmeyin! E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.' 
                    : "Don't worry! Enter your email and we'll send you a reset link."}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {locale === 'tr' ? 'E-posta Adresi' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      placeholder="ornek@email.com"
                      className={`w-full pl-12 pr-4 py-4 border-2 rounded-xl focus:ring-0 focus:border-orange-500 transition-colors text-gray-900 placeholder-gray-400 ${
                        error ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                      autoFocus
                    />
                  </div>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 text-sm text-red-600 flex items-center gap-1"
                    >
                      <ExclamationCircleIcon className="w-4 h-4" />
                      {error}
                    </motion.p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {locale === 'tr' ? 'Gönderiliyor...' : 'Sending...'}
                    </span>
                  ) : (
                    locale === 'tr' ? 'Sıfırlama Bağlantısı Gönder' : 'Send Reset Link'
                  )}
                </button>
              </form>

              {/* Help Text */}
              <p className="mt-6 text-center text-sm text-gray-500">
                {locale === 'tr' ? 'Hesabınız yok mu?' : "Don't have an account?"}{' '}
                <Link href="/register" className="text-orange-600 hover:text-orange-700 font-semibold">
                  {locale === 'tr' ? 'Kayıt olun' : 'Sign up'}
                </Link>
              </p>
            </div>
          ) : (
            /* Success State */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-xl shadow-green-500/10 p-8 md:p-10 border border-gray-100 text-center"
            >
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircleIcon className="w-12 h-12 text-green-600" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {locale === 'tr' ? 'E-posta Gönderildi!' : 'Email Sent!'}
              </h2>
              
              <p className="text-gray-500 mb-2">
                {locale === 'tr' 
                  ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.' 
                  : 'A password reset link has been sent to your email.'}
              </p>
              
              <p className="text-sm text-gray-400 mb-8">
                <strong className="text-gray-600">{email}</strong>
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-800">
                  💡 {locale === 'tr' 
                    ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin.' 
                    : "Can't find the email? Check your spam/junk folder."}
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all"
                >
                  {locale === 'tr' ? 'Giriş Sayfasına Dön' : 'Back to Login'}
                </Link>
                
                <button
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail('');
                  }}
                  className="block w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  {locale === 'tr' ? 'Farklı E-posta Dene' : 'Try Different Email'}
                </button>
              </div>
            </motion.div>
          )}
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
