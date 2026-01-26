'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
      await register(displayName, email, password, formattedPhone, birthDate, acceptMarketing);
      toast.success(
        locale === 'en' 
          ? 'Registration successful! Please check your email to verify your account.' 
          : 'Kayıt başarılı! Lütfen email adresinize gönderilen doğrulama linkine tıklayın.'
      );
      // Redirect to login page with message about email verification
      window.location.href = '/login?verified=false';
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Registration failed' : 'Kayıt başarısız'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left - Hero */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-12">
        <div className="max-w-lg text-white text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-8xl mb-8">🚗</div>
            <h2 className="text-3xl font-bold mb-4">
              {locale === 'en' ? 'Grow Your Collection' : 'Koleksiyonunuzu Büyütün'}
            </h2>
            <p className="text-gray-300 text-lg">
              {locale === 'en' 
                ? 'Sign up for free, publish your first 5 listings for free. Enrich your collection with the trade feature.'
                : 'Ücretsiz üye olun, ilk 5 ilanınızı ücretsiz yayınlayın. Takas özelliğiyle koleksiyonunuzu zenginleştirin.'}
            </p>
            
            <div className="mt-12 grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-4xl font-bold">10K+</p>
                <p className="text-gray-400 text-sm">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div>
                <p className="text-4xl font-bold">5K+</p>
                <p className="text-gray-400 text-sm">{locale === 'en' ? 'Members' : 'Üye'}</p>
              </div>
              <div>
                <p className="text-4xl font-bold">2K+</p>
                <p className="text-gray-400 text-sm">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8">
              <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">🚗</span>
              </div>
              <span className="font-display font-bold text-2xl">
                TARODAN
              </span>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('auth.createAccount')}
            </h1>
            <p className="text-gray-600">
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
        </motion.div>
      </div>
    </div>
  );
}
