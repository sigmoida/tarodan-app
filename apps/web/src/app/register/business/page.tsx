'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  BuildingOfficeIcon,
  EnvelopeIcon, 
  LockClosedIcon, 
  EyeIcon, 
  EyeSlashIcon,
  PhoneIcon,
  IdentificationIcon,
  MapPinIcon,
  HashtagIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

// Turkish cities (major ones)
const TURKISH_CITIES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta',
  'İçel (Mersin)', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
  'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla',
  'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt',
  'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak',
  'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman',
  'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce'
];

// Company types
const COMPANY_TYPES = [
  'Limited Şirket',
  'Anonim Şirket',
  'Kollektif Şirket',
  'Komandit Şirket',
  'Şahıs İşletmesi',
  'Diğer'
];

export default function BusinessRegisterPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Phone number formatting helper
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

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

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

  // Registration success screen
  if (registrationSuccess) {
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
    
    if (!companyName.trim() || !email.trim() || !phone.trim() || !taxId.trim() || !city.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Please fill in all required fields' : 'Lütfen tüm zorunlu alanları doldurun');
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

    // Format phone for API
    const formattedPhone = phone ? '+90' + phone.replace(/\s/g, '') : undefined;

    setIsLoading(true);
    try {
      await api.post('/auth/register/business', {
        companyName,
        email,
        password,
        phone: formattedPhone,
        companyType,
        taxId,
        city,
        district: district || undefined,
        acceptsMarketingEmails: false,
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
      {/* Left - Hero */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-12">
        <div className="max-w-lg text-white text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-8xl mb-8">🏢</div>
            <h2 className="text-3xl font-bold mb-4">
              {locale === 'en' ? 'Business Account' : 'Şirket Hesabı'}
            </h2>
            <p className="text-gray-300 text-lg">
              {locale === 'en' 
                ? 'Create a business account to access advanced features and manage your company listings.'
                : 'Gelişmiş özelliklere erişmek ve şirket ilanlarınızı yönetmek için şirket hesabı oluşturun.'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl"
        >
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8">
              <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">🏢</span>
              </div>
              <span className="font-display font-bold text-2xl">
                TARODAN
              </span>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {locale === 'en' ? 'Business Account Registration' : 'Şirket Hesabı Kaydı'}
            </h1>
            <p className="text-gray-600">
              {locale === 'en' ? 'Create your business account' : 'Şirket hesabınızı oluşturun'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl shadow-lg p-6 md:p-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {locale === 'en' ? 'Company Name' : 'Şirket İsmi'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={locale === 'en' ? 'Company Name' : 'Şirket İsmi'}
                  className="input pl-12"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.email')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
                    className="input pl-12"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.phone')} <span className="text-red-500">*</span>
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
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Company Type' : 'Şirket Türü'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-10" />
                  <select
                    value={companyType}
                    onChange={(e) => setCompanyType(e.target.value)}
                    className="input pl-12 appearance-none"
                    required
                  >
                    <option value="">{locale === 'en' ? 'Select Company Type' : 'Şirket Türü Seçin'}</option>
                    {COMPANY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Tax ID Number' : 'Vergi Kimlik Numarası'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <HashtagIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ''))}
                    placeholder={locale === 'en' ? '10-11 digits' : '10-11 haneli'}
                    maxLength={11}
                    className="input pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'City' : 'İl'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-10" />
                  <select
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setDistrict(''); // Reset district when city changes
                    }}
                    className="input pl-12 appearance-none"
                    required
                  >
                    <option value="">{locale === 'en' ? 'Select City' : 'İl Seçin'}</option>
                    {TURKISH_CITIES.map((cityName) => (
                      <option key={cityName} value={cityName}>{cityName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'District' : 'İlçe'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder={locale === 'en' ? 'District' : 'İlçe'}
                    className="input pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('auth.password')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-12 pr-12"
                    required
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
                  {t('auth.confirmPassword')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                required
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

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading 
                ? (locale === 'en' ? 'Registering...' : 'Kayıt yapılıyor...') 
                : (locale === 'en' ? 'Register Business Account' : 'Şirket Hesabı Oluştur')}
            </button>
          </form>

          <p className="text-center mt-6 text-gray-600">
            {locale === 'en' ? 'Already have an account?' : 'Zaten hesabınız var mı?'}{' '}
            <Link href="/login" className="text-primary-500 font-semibold hover:text-primary-600">
              {t('common.login')}
            </Link>
          </p>

          <p className="text-center mt-4 text-gray-600">
            {locale === 'en' ? 'Not a business?' : 'Şirket değil misiniz?'}{' '}
            <Link href="/register" className="text-primary-500 font-semibold hover:text-primary-600">
              {locale === 'en' ? 'Register as Individual' : 'Bireysel Kayıt Ol'}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
