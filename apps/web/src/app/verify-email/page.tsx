'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  CheckCircleIcon, 
  XCircleIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { locale } = useTranslation();

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    const verifyEmail = async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
        toast.success(locale === 'tr' ? 'E-posta adresiniz doğrulandı!' : 'Email verified successfully!');
      } catch (error: any) {
        console.error('Email verification failed:', error);
        setStatus('error');
        setErrorMessage(
          error.response?.data?.message || 
          (locale === 'tr' ? 'Doğrulama başarısız' : 'Verification failed')
        );
      }
    };

    verifyEmail();
  }, [token, locale]);

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
          {status === 'loading' && (
            <div className="bg-white rounded-3xl shadow-xl shadow-orange-500/10 p-8 md:p-10 border border-gray-100 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-full flex items-center justify-center">
                  <ArrowPathIcon className="w-10 h-10 text-orange-600 animate-spin" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {locale === 'tr' ? 'E-posta Doğrulanıyor...' : 'Verifying Email...'}
              </h2>
              <p className="text-gray-500">
                {locale === 'tr' ? 'Lütfen bekleyin...' : 'Please wait...'}
              </p>
            </div>
          )}

          {status === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-xl shadow-green-500/10 p-8 md:p-10 border border-gray-100 text-center"
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
                {locale === 'tr' ? 'E-posta Doğrulandı! 🎉' : 'Email Verified! 🎉'}
              </h2>
              
              <p className="text-gray-500 mb-8">
                {locale === 'tr' 
                  ? 'E-posta adresiniz başarıyla doğrulandı. Artık hesabınıza giriş yapabilirsiniz.' 
                  : 'Your email has been successfully verified. You can now login to your account.'}
              </p>

              <Link
                href="/login"
                className="block w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25"
              >
                {locale === 'tr' ? 'Giriş Yap' : 'Login Now'}
              </Link>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-xl shadow-red-500/10 p-8 md:p-10 border border-gray-100 text-center"
            >
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-rose-100 rounded-full flex items-center justify-center">
                  <XCircleIcon className="w-12 h-12 text-red-600" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {locale === 'tr' ? 'Doğrulama Başarısız' : 'Verification Failed'}
              </h2>
              
              <p className="text-gray-500 mb-4">
                {errorMessage}
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-800">
                  💡 {locale === 'tr' 
                    ? 'Bağlantının süresi dolmuş olabilir. Yeni bir doğrulama e-postası isteyebilirsiniz.' 
                    : 'The link may have expired. You can request a new verification email.'}
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all"
                >
                  {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
                </Link>
                
                <Link
                  href="/register"
                  className="block w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  {locale === 'tr' ? 'Yeniden Kayıt Ol' : 'Register Again'}
                </Link>
              </div>
            </motion.div>
          )}

          {status === 'no-token' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-xl shadow-orange-500/10 p-8 md:p-10 border border-gray-100 text-center"
            >
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center">
                  <EnvelopeIcon className="w-10 h-10 text-orange-600" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                {locale === 'tr' ? 'E-posta Doğrulama' : 'Email Verification'}
              </h2>
              
              <p className="text-gray-500 mb-8">
                {locale === 'tr' 
                  ? 'E-postanızdaki doğrulama linkine tıklayarak hesabınızı aktifleştirin.' 
                  : 'Click the verification link in your email to activate your account.'}
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-800">
                  📬 {locale === 'tr' 
                    ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin.' 
                    : "Can't find the email? Check your spam/junk folder."}
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all"
                >
                  {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
                </Link>
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
