'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  UserIcon, 
  EnvelopeIcon, 
  LockClosedIcon, 
  EyeIcon, 
  EyeSlashIcon,
  PhoneIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { register, isAuthenticated, isLoading: authLoading } = useAuthStore();
  
  // All useState hooks must be declared before any early returns
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Phone number formatting helper
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    // Format as XXX XXX XX XX
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  // Calculate minimum birth date (18 years ago)
  const getMaxBirthDate = (): string => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today.toISOString().split('T')[0];
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  // Block rendering for authenticated users - show loading or redirect message
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            {locale === 'en' ? 'You are already logged in.' : 'Zaten giriş yapmışsınız.'}
          </p>
          <Link href="/" className="btn-primary">
            {locale === 'en' ? 'Go to Home' : 'Ana Sayfaya Dön'}
          </Link>
        </div>
      </div>
    );
  }

  // Registration success - show verification pending screen
  if (registrationSuccess) {
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
                <EnvelopeIcon className="w-10 h-10 text-green-600" />
              </motion.div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {locale === 'en' ? 'Check Your Email! 📬' : 'E-postanızı Kontrol Edin! 📬'}
            </h2>
            
            <p className="text-gray-500 mb-2">
              {locale === 'en' 
                ? 'We have sent a verification link to:' 
                : 'Doğrulama linki gönderildi:'}
            </p>
            
            <p className="font-semibold text-gray-800 mb-6">
              {registeredEmail}
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-blue-800 mb-2">
                📌 {locale === 'en' ? 'Next steps:' : 'Sonraki adımlar:'}
              </p>
              <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                <li>{locale === 'en' ? 'Open your email inbox' : 'E-posta kutunuzu açın'}</li>
                <li>{locale === 'en' ? 'Find the email from Tarodan' : 'Tarodan\'dan gelen e-postayı bulun'}</li>
                <li>{locale === 'en' ? 'Click the verification link' : 'Doğrulama linkine tıklayın'}</li>
                <li>{locale === 'en' ? 'Login to your account' : 'Hesabınıza giriş yapın'}</li>
              </ol>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-800">
                💡 {locale === 'en' 
                  ? "Can't find the email? Check your spam/junk folder." 
                  : "E-postayı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin."}
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                {locale === 'en' ? 'Go to Login' : 'Giriş Sayfasına Git'}
              </Link>
              
              <button
                onClick={async () => {
                  try {
                    await api.post('/auth/resend-verification', { email: registeredEmail });
                    toast.success(locale === 'en' ? 'Verification email resent!' : 'Doğrulama e-postası tekrar gönderildi!');
                  } catch (error) {
                    toast.error(locale === 'en' ? 'Could not resend email' : 'E-posta gönderilemedi');
                  }
                }}
                className="block w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                {locale === 'en' ? 'Resend Verification Email' : 'Doğrulama E-postasını Tekrar Gönder'}
              </button>
            </div>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} Tarodan. {locale === 'en' ? 'All rights reserved.' : 'Tüm hakları saklıdır.'}
          </p>
        </footer>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Please fill in all fields' : 'Tüm alanları doldurun');
      return;
    }

    // Birth date validation - must be 18+
    if (!birthDate) {
      toast.error(locale === 'en' ? 'Please enter your birth date' : 'Lütfen doğum tarihinizi girin');
      return;
    }

    const birthDateObj = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }
    
    if (age < 18) {
      toast.error(locale === 'en' 
        ? 'You must be at least 18 years old to register. If you are under 18, please ask your parent or guardian to create an account.'
        : 'Kayıt olmak için 18 yaşından büyük olmalısınız. 18 yaşından küçükseniz, lütfen ebeveyn veya vasinizden hesap oluşturmasını isteyin.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('validation.passwordMatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(locale === 'en' ? 'Password must be at least 8 characters' : 'Şifre en az 8 karakter olmalıdır');
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error(locale === 'en' 
        ? 'Password must contain at least one uppercase, one lowercase, and one number'
        : 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir');
      return;
    }

    if (!agreeTerms) {
      toast.error(locale === 'en' ? 'You must accept the terms of service' : 'Kullanım şartlarını kabul etmelisiniz');
      return;
    }

    // Format phone for API (remove spaces, add country code if needed)
    const formattedPhone = phone ? '+90' + phone.replace(/\s/g, '') : undefined;

    setIsLoading(true);
    try {
      // Use API directly instead of authStore.register to avoid auto-login
      await api.post('/auth/register', {
        displayName,
        email,
        password,
        phone: formattedPhone,
        birthDate,
        acceptsMarketingEmails: acceptMarketing,
      });
      setRegisteredEmail(email);
      setRegistrationSuccess(true);
      toast.success(locale === 'en' ? 'Registration successful! Please verify your email.' : 'Kayıt başarılı! Lütfen e-postanızı doğrulayın.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Registration failed' : 'Kayıt başarısız'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left - Brand panel (no emoji, professional) */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="max-w-md text-white text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {locale === 'en' ? 'Grow Your Collection' : 'Koleksiyonunuzu Büyütün'}
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              {locale === 'en' 
                ? 'Sign up for free, publish your first 5 listings for free. Enrich your collection with the trade feature.'
                : 'Ücretsiz üye olun, ilk 5 ilanınızı ücretsiz yayınlayın. Takas özelliğiyle koleksiyonunuzu zenginleştirin.'}
            </p>
            <div className="pt-8 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-white">10K+</p>
                <p className="text-gray-400 text-xs">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">5K+</p>
                <p className="text-gray-400 text-xs">{locale === 'en' ? 'Members' : 'Üye'}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">2K+</p>
                <p className="text-gray-400 text-xs">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="mb-10">
            <Link href="/" className="inline-flex items-center gap-3 mb-10">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan"
                width={40}
                height={40}
                className="rounded-lg object-contain"
              />
              <span className="font-display font-bold text-xl tracking-tight text-gray-900">
                TARODAN
              </span>
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight mb-1.5">
              {t('auth.createAccount')}
            </h1>
            <p className="text-sm text-gray-500 font-normal">
              {locale === 'en' ? 'Join the collectors' : 'Koleksiyonerlere katılın'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {locale === 'en' ? 'Full Name' : 'Ad Soyad'}
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={locale === 'en' ? 'Your Full Name' : 'Adınız Soyadınız'}
                  className="input pl-12"
                />
              </div>
            </div>

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
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.phone')}
                </label>
                <div className="relative flex">
                  <span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl text-gray-500 text-sm font-medium">
                    +90
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="5XX XXX XX XX"
                    maxLength={14}
                    className="input rounded-l-none flex-1 pl-3"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === 'en' ? '10 digits without country code' : 'Ülke kodu olmadan 10 rakam'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.birthDate')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={getMaxBirthDate()}
                    required
                    className="input pl-12"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === 'en' ? 'You must be at least 18 years old' : '18 yaşından büyük olmalısınız'}
                </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.confirmPassword')}
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-12"
                />
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">
                {locale === 'en' ? (
                  <>
                    I have read and accept the{' '}
                    <Link href="/terms" className="text-primary-500 hover:text-primary-600">
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="text-primary-500 hover:text-primary-600">
                      Privacy Policy
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    <Link href="/terms" className="text-primary-500 hover:text-primary-600">
                      Kullanım Şartları
                    </Link>
                    {' '}ve{' '}
                    <Link href="/privacy" className="text-primary-500 hover:text-primary-600">
                      Gizlilik Politikası
                    </Link>
                    'nı okudum ve kabul ediyorum.
                  </>
                )}
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptMarketing}
                onChange={(e) => setAcceptMarketing(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">
                {locale === 'en' 
                  ? 'I want to receive promotional emails, campaigns and special offers.'
                  : 'Reklam ve kampanya e-postalarını, özel teklifleri almak istiyorum.'}
              </span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading 
                ? (locale === 'en' ? 'Signing up...' : 'Kayıt yapılıyor...') 
                : t('common.register')}
            </button>
          </form>

          <p className="text-center mt-8 text-gray-600">
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="text-primary-500 font-semibold hover:text-primary-600">
              {t('common.login')}
            </Link>
          </p>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-600 mb-4">
              {locale === 'en' ? 'Are you a business?' : 'Şirket misiniz?'}
            </p>
            <Link
              href="/register/business"
              className="block w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-center"
            >
              {locale === 'en' ? 'Open Business Account' : 'Şirket Hesabı Aç'}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
