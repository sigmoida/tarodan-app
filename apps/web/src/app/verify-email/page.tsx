'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
import { Spinner } from '@tarodan/ui';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { locale } = useTranslation();

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

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
        if (process.env.NODE_ENV === 'development') console.error('Email verification failed:', error);
        setStatus('error');
        setErrorMessage(
          error.response?.data?.message || 
          (locale === 'tr' ? 'Doğrulama başarısız' : 'Verification failed')
        );
      }
    };

    verifyEmail();
  }, [token, locale]);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email) {
      toast.error(locale === 'tr' ? 'E-posta adresi girin' : 'Enter email address');
      return;
    }
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await api.post('/auth/resend-verification', { email });
      setResendSuccess(true);
      toast.success(locale === 'tr' ? 'Doğrulama e-postası gönderildi' : 'Verification email sent');
    } catch (err: any) {
      toast.error(err.response?.data?.message || (locale === 'tr' ? 'Gönderilemedi' : 'Failed to send'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-amber-50 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <Image src="/tarodan-logo.jpg" alt="Tarodan" width={36} height={36} className="rounded-lg object-contain" />
          <span className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
            Tarodan
          </span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-md"
        >
          {status === 'loading' && (
            <div className="bg-white rounded-3xl shadow-xl shadow-primary-500/10 p-8 md:p-10 border border-gray-100 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-amber-100 rounded-full flex items-center justify-center">
                  <ArrowPathIcon className="w-10 h-10 text-primary-600 animate-spin" />
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
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
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
                {locale === 'tr' ? 'E-posta Doğrulandı!' : 'Email Verified!'}
              </h2>
              
              <p className="text-gray-500 mb-8">
                {locale === 'tr' 
                  ? 'E-posta adresiniz başarıyla doğrulandı. Artık hesabınıza giriş yapabilirsiniz.' 
                  : 'Your email has been successfully verified. You can now login to your account.'}
              </p>

              <Link
                href="/login"
                className="block w-full py-4 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 text-center"
              >
                {locale === 'tr' ? 'Giriş Yap' : 'Login Now'}
              </Link>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
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
                  {locale === 'tr' 
                    ? 'Bağlantının süresi dolmuş olabilir. Yeni bir doğrulama e-postası isteyebilirsiniz.' 
                    : 'The link may have expired. You can request a new verification email.'}
                </p>
              </div>

              <form onSubmit={handleResendVerification} className="mb-6 space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder={locale === 'tr' ? 'E-posta adresiniz' : 'Your email'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ease-premium text-gray-900"
                  required
                />
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-all duration-200 ease-premium flex items-center justify-center gap-2"
                >
                  {resendLoading ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    locale === 'tr' ? 'Yeniden doğrulama e-postası gönder' : 'Resend verification email'
                  )}
                </button>
                {resendSuccess && (
                  <p className="text-sm text-green-600 text-center">
                    {locale === 'tr' ? 'E-posta gönderildi. Gelen kutunuzu kontrol edin.' : 'Email sent. Check your inbox.'}
                  </p>
                )}
              </form>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block w-full py-3 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
                >
                  {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
                </Link>
                
                <Link
                  href="/register"
                  className="block w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all duration-200 ease-premium text-center"
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
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="bg-white rounded-3xl shadow-xl shadow-primary-500/10 p-8 md:p-10 border border-gray-100 text-center"
            >
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-amber-100 rounded-2xl flex items-center justify-center">
                  <EnvelopeIcon className="w-10 h-10 text-primary-600" />
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
                  {locale === 'tr' 
                    ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin veya yeni doğrulama e-postası isteyin.' 
                    : "Can't find the email? Check your spam/junk folder or request a new verification email."}
                </p>
              </div>

              <form onSubmit={handleResendVerification} className="mb-6 space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder={locale === 'tr' ? 'E-posta adresiniz' : 'Your email'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ease-premium text-gray-900"
                  required
                />
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-all duration-200 ease-premium flex items-center justify-center gap-2"
                >
                  {resendLoading ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    locale === 'tr' ? 'Yeniden doğrulama e-postası gönder' : 'Resend verification email'
                  )}
                </button>
                {resendSuccess && (
                  <p className="text-sm text-green-600 text-center">
                    {locale === 'tr' ? 'E-posta gönderildi. Gelen kutunuzu kontrol edin.' : 'Email sent. Check your inbox.'}
                  </p>
                )}
              </form>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block w-full py-3 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium text-center"
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
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-amber-50 flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
