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

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    const limited = digits.slice(0, 10);
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const getMaxBirthDate = (): string => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            {locale === 'en' ? 'You are already logged in.' : 'Zaten giriş yapmışsınız.'}
          </p>
          <Link href="/" className="inline-block px-6 py-2.5 bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-colors" style={{ borderRadius: '6px' }}>
            {locale === 'en' ? 'Go to Home' : 'Ana Sayfaya Dön'}
          </Link>
        </div>
      </div>
    );
  }

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={36} height={36} className="rounded-lg object-contain" />
            <span className="text-lg font-bold text-gray-900">TARODAN</span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md border border-gray-200 bg-white p-8 text-center"
            style={{ borderRadius: '8px' }}
          >
            <div className="flex justify-center mb-5">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-16 h-16 bg-green-50 border border-green-200 flex items-center justify-center"
                style={{ borderRadius: '50%' }}
              >
                <EnvelopeIcon className="w-8 h-8 text-green-600" />
              </motion.div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {locale === 'en' ? 'Check Your Email!' : 'E-postanızı Kontrol Edin!'}
            </h2>
            
            <p className="text-sm text-gray-500 mb-1">
              {locale === 'en' ? 'We have sent a verification link to:' : 'Doğrulama linki gönderildi:'}
            </p>
            
            <p className="font-semibold text-gray-800 mb-5">{registeredEmail}</p>

            <div className="bg-gray-50 border border-gray-200 p-4 mb-5 text-left" style={{ borderRadius: '6px' }}>
              <p className="text-sm text-gray-700 font-medium mb-2">
                {locale === 'en' ? 'Next steps:' : 'Sonraki adımlar:'}
              </p>
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                <li>{locale === 'en' ? 'Open your email inbox' : 'E-posta kutunuzu açın'}</li>
                <li>{locale === 'en' ? 'Find the email from Tarodan' : 'Tarodan\'dan gelen e-postayı bulun'}</li>
                <li>{locale === 'en' ? 'Click the verification link' : 'Doğrulama linkine tıklayın'}</li>
                <li>{locale === 'en' ? 'Login to your account' : 'Hesabınıza giriş yapın'}</li>
              </ol>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 mb-5" style={{ borderRadius: '6px' }}>
              <p className="text-xs text-amber-700">
                {locale === 'en' 
                  ? "Can't find the email? Check your spam/junk folder." 
                  : "E-postayı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin."}
              </p>
            </div>

            <div className="space-y-2.5">
              <Link
                href="/login"
                className="block w-full py-2.5 bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-colors text-center"
                style={{ borderRadius: '6px' }}
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
                className="block w-full py-2.5 bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors"
                style={{ borderRadius: '6px' }}
              >
                {locale === 'en' ? 'Resend Verification Email' : 'Doğrulama E-postasını Tekrar Gönder'}
              </button>
            </div>
          </motion.div>
        </main>

        <footer className="p-6 text-center">
          <p className="text-xs text-gray-400">
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
        ? 'You must be at least 18 years old to register.'
        : 'Kayıt olmak için 18 yaşından büyük olmalısınız.');
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

    const formattedPhone = phone ? '+90' + phone.replace(/\s/g, '') : undefined;

    setIsLoading(true);
    try {
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

  const inputClass = "w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors";
  const inputStyle = { borderRadius: '6px' };

  return (
    <div className="min-h-screen flex">
      {/* Left - Image panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <Image
          src="/photos/hero/hero-hot-wheels.png"
          alt="Diecast model araba koleksiyonu"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/50 to-black/20" />
        <div className="absolute inset-0 flex items-center justify-center p-10 z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">
              {locale === 'en' ? 'Grow Your Collection' : 'Koleksiyonunuzu Büyütün'}
            </h2>
            <p className="text-sm text-white/80 max-w-md drop-shadow">
              {locale === 'en' 
                ? 'Sign up for free and start your diecast journey today.'
                : 'Ücretsiz üye olun, diecast yolculuğunuza bugün başlayın.'}
            </p>
            <div className="flex items-center gap-5 mt-5">
              {[
                { v: '10K+', l: locale === 'en' ? 'Listings' : 'İlan' },
                { v: '5K+', l: locale === 'en' ? 'Members' : 'Üye' },
                { v: '2K+', l: locale === 'en' ? 'Trades' : 'Takas' },
              ].map((s, i) => (
                <div key={s.l} className="flex items-center gap-5">
                  {i > 0 && <div className="w-px h-6 bg-white/30" />}
                  <div>
                    <p className="text-lg font-bold text-white drop-shadow">{s.v}</p>
                    <p className="text-xs text-white/60">{s.l}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-white overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[420px]"
        >
          <div className="mb-7">
            <Link href="/" className="inline-block mb-7">
              <Image src="/tarodan-logo.jpg" alt="Tarodan" width={44} height={44} className="rounded-lg object-contain" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
              {t('auth.createAccount')}
            </h1>
            <p className="text-sm text-gray-500">
              {locale === 'en' ? 'Join the collectors community' : 'Koleksiyonerler topluluğuna katılın'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {locale === 'en' ? 'Full Name' : 'Ad Soyad'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={locale === 'en' ? 'Your Full Name' : 'Adınız Soyadınız'}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.email')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.phone')}
                </label>
                <div className="relative flex">
                  <span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 text-gray-500 text-sm font-medium" style={{ borderRadius: '6px 0 0 6px' }}>
                    +90
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="5XX XXX XX XX"
                    maxLength={14}
                    className="flex-1 pl-3 pr-4 py-2.5 text-sm border border-gray-300 bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
                    style={{ borderRadius: '0 6px 6px 0' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.birthDate')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={getMaxBirthDate()}
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.password')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeSlashIcon className="w-[18px] h-[18px]" /> : <EyeIcon className="w-[18px] h-[18px]" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {locale === 'en' ? 'Min 8 chars, uppercase, lowercase & number' : 'En az 8 karakter, büyük/küçük harf ve rakam'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.confirmPassword')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 border-gray-300 text-orange-500 focus:ring-orange-500"
                  style={{ borderRadius: '3px' }}
                />
                <span className="text-sm text-gray-600 leading-snug">
                  {locale === 'en' ? (
                    <>
                      I accept the{' '}
                      <Link href="/terms" className="text-orange-600 hover:text-orange-700 font-medium">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy" className="text-orange-600 hover:text-orange-700 font-medium">Privacy Policy</Link>.
                    </>
                  ) : (
                    <>
                      <Link href="/terms" className="text-orange-600 hover:text-orange-700 font-medium">Kullanım Şartları</Link>
                      {' '}ve{' '}
                      <Link href="/privacy" className="text-orange-600 hover:text-orange-700 font-medium">Gizlilik Politikası</Link>
                      &apos;nı okudum ve kabul ediyorum.
                    </>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptMarketing}
                  onChange={(e) => setAcceptMarketing(e.target.checked)}
                  className="w-4 h-4 mt-0.5 border-gray-300 text-orange-500 focus:ring-orange-500"
                  style={{ borderRadius: '3px' }}
                />
                <span className="text-sm text-gray-600 leading-snug">
                  {locale === 'en' 
                    ? 'I want to receive promotional emails and special offers.'
                    : 'Reklam ve kampanya e-postalarını almak istiyorum.'}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 active:bg-orange-700 transition-colors disabled:opacity-60 mt-1"
              style={{ borderRadius: '6px' }}
            >
              {isLoading 
                ? (locale === 'en' ? 'Signing up...' : 'Kayıt yapılıyor...') 
                : t('common.register')}
            </button>
          </form>

          <p className="text-center mt-5 text-sm text-gray-500">
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">
              {t('common.login')}
            </Link>
          </p>

          <div className="mt-5 pt-5 border-t border-gray-200">
            <Link
              href="/register/business"
              className="flex items-center justify-center gap-2 w-full py-2.5 border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
              style={{ borderRadius: '6px' }}
            >
              {locale === 'en' ? 'Open Business Account' : 'Şirket Hesabı Aç'}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
