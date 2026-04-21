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
import { Button, Checkbox, Input, Spinner } from '@tarodan/ui';
import { formatPhoneNumber } from '@/lib/phone';

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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
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
        <Spinner size="lg" />
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
          <Link href="/" className="inline-block px-6 py-2.5 rounded-lg bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition-all duration-200 ease-premium">
            {locale === 'en' ? 'Go to Home' : 'Ana Sayfaya Dön'}
          </Link>
        </div>
      </div>
    );
  }

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-warning-50 flex flex-col">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={36} height={36} className="rounded-lg object-contain" />
            <span className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
              Tarodan
            </span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-lg"
          >
            <div className="bg-white rounded-3xl shadow-2xl shadow-success-500/10 p-8 md:p-10 border border-gray-100 text-center relative overflow-hidden">
              {/* Decorative background circles */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-success-50 rounded-full opacity-60" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary-50 rounded-full opacity-60" />
              
              <div className="relative z-10">
                <div className="flex justify-center mb-6">
                  <motion.div 
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                    className="w-24 h-24 bg-gradient-to-br from-success-400 to-success-500 rounded-full flex items-center justify-center shadow-lg shadow-success-500/30"
                  >
                    <EnvelopeIcon className="w-12 h-12 text-white" />
                  </motion.div>
                </div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl md:text-3xl font-bold text-gray-900 mb-2"
                >
                  {locale === 'en' ? 'Almost There!' : 'Neredeyse Tamam!'}
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-500 mb-1"
                >
                  {locale === 'en' ? 'We sent a verification link to:' : 'Doğrulama linki gönderildi:'}
                </motion.p>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="font-semibold text-gray-800 mb-6 text-lg bg-gray-50 py-2 px-4 rounded-lg inline-block"
                >
                  {registeredEmail}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-6 mb-6 text-left"
                >
                  <p className="text-sm text-gray-700 font-semibold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-bold">?</span>
                    {locale === 'en' ? 'What to do next:' : 'Şimdi ne yapmalısınız:'}
                  </p>
                  <div className="space-y-3">
                    {[
                      { step: '1', text: locale === 'en' ? 'Open your email inbox' : 'E-posta kutunuzu açın' },
                      { step: '2', text: locale === 'en' ? 'Find the email from Tarodan' : 'Tarodan\'dan gelen e-postayı bulun' },
                      { step: '3', text: locale === 'en' ? 'Click the verification link' : 'Doğrulama linkine tıklayın' },
                      { step: '4', text: locale === 'en' ? 'Come back and login!' : 'Geri gelip giriş yapın!' },
                    ].map((item, i) => (
                      <motion.div
                        key={item.step}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + i * 0.1 }}
                        className="flex items-center gap-3"
                      >
                        <span className="w-7 h-7 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {item.step}
                        </span>
                        <span className="text-sm text-gray-700">{item.text}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 }}
                  className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6 flex items-start gap-3"
                >
                  <span className="text-warning-500 text-lg flex-shrink-0 mt-0.5">💡</span>
                  <p className="text-sm text-warning-800 text-left">
                    {locale === 'en' 
                      ? "Can't find it? Check your spam/junk folder. Verification link expires in 24 hours." 
                      : "Bulamıyor musunuz? Spam/Gereksiz klasörünü kontrol edin. Doğrulama linki 24 saat geçerlidir."}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 }}
                  className="space-y-3"
                >
                  <Link
                    href="/login"
                    className="block w-full py-3.5 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-all duration-200 ease-premium shadow-lg shadow-primary-500/25 text-center"
                  >
                    {locale === 'en' ? 'Go to Login' : 'Giriş Sayfasına Git'}
                  </Link>
                  
                  <Button variant="secondary" onClick={async () => {
                      try {
                        await api.post('/auth/resend-verification', { email: registeredEmail });
                        toast.success(locale === 'en' ? 'Verification email resent!' : 'Doğrulama e-postası tekrar gönderildi!');
                      } catch (error) {
                        toast.error(locale === 'en' ? 'Could not resend email' : 'E-posta gönderilemedi');
                      }
                    }}
                    className="block w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all">
                    {locale === 'en' ? 'Resend Verification Email' : 'Doğrulama E-postasını Tekrar Gönder'}
                  </Button>
                  
                  <Link
                    href="/verify-email"
                    className="block text-center text-sm text-gray-500 hover:text-primary-600 transition-colors duration-200 mt-2"
                  >
                    {locale === 'en' ? 'Need to verify later? Go to verification page' : 'Daha sonra mı doğrulayacaksınız? Doğrulama sayfasına gidin'}
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </main>

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

  const inputClass = "pl-10 pr-4 bg-gray-50 focus:bg-white transition-all duration-200 ease-premium";

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
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">
        <div className="px-6 pt-6">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={36} height={36} className="rounded-lg object-contain" />
            <span className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
              Tarodan
            </span>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-[420px]"
        >
          <div className="mb-7">
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
                {locale === 'en' ? 'Full Name' : 'Ad Soyad'} <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={locale === 'en' ? 'Your Full Name' : 'Adınız Soyadınız'}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.email')} <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.phone')}
                </label>
                <div className="relative flex min-w-0">
                  <span className="inline-flex items-center bg-gray-100 border-r-0 text-gray-500 font-medium rounded-l-lg flex-shrink-0">
                    +90
                  </span>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="5XX XXX XX XX"
                    maxLength={14}
                    className="flex-1 min-w-0 rounded-r-lg rounded-l-none bg-gray-50 focus:bg-white transition-all duration-200 ease-premium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('auth.birthDate')} <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={getMaxBirthDate()}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.password')} <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-gray-50 focus:bg-white transition-all duration-200 ease-premium"
                />
                <Button variant="secondary" type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200">
                  {showPassword ? <EyeSlashIcon className="w-[18px] h-[18px]" /> : <EyeIcon className="w-[18px] h-[18px]" />}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {locale === 'en' ? 'Min 8 chars, uppercase, lowercase & number' : 'En az 8 karakter, büyük/küçük harf ve rakam'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('auth.confirmPassword')} <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded-sm transition-colors duration-200"
                />
                <span className="text-sm text-gray-600 leading-snug">
                  {locale === 'en' ? (
                    <>
                      I accept the{' '}
                      <Link href="/terms" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200">Privacy Policy</Link>.
                    </>
                  ) : (
                    <>
                      <Link href="/terms" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200">Kullanım Şartları</Link>
                      {' '}ve{' '}
                      <Link href="/privacy" className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200">Gizlilik Politikası</Link>
                      &apos;nı okudum ve kabul ediyorum.
                    </>
                  )}
                </span>
              </label>

              <Checkbox
                checked={acceptMarketing}
                onChange={(e) => setAcceptMarketing(e.target.checked)}
                label={locale === 'en'
                  ? 'I want to receive promotional emails and special offers.'
                  : 'Reklam ve kampanya e-postalarını almak istiyorum.'}
              />
            </div>

            <Button variant="secondary" type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 active:bg-primary-700 transition-all duration-200 ease-premium disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 mt-1">
              {isLoading && (
                <svg className="animate-spin h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isLoading 
                ? (locale === 'en' ? 'Signing up...' : 'Kayıt yapılıyor...') 
                : t('common.register')}
            </Button>
          </form>

          <p className="text-center mt-5 text-sm text-gray-500">
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors duration-200">
              {t('common.login')}
            </Link>
          </p>

          <div className="mt-5 pt-5 border-t border-gray-200">
            <Link
              href="/register/business"
              className="items-center justify-center gap-2 py-2.5 text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 ease-premium"
            >
              {locale === 'en' ? 'Open Business Account' : 'Şirket Hesabı Aç'}
            </Link>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
