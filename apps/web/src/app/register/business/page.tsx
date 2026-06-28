"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { Button, Checkbox, Input, Select, Spinner } from "@tarodan/ui";
import { formatPhoneNumber } from "@/lib/phone";
import { ButtonLink } from "@/components/ui/ButtonLink";

// Turkish cities (major ones)
const TURKISH_CITIES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Amasya",
  "Ankara",
  "Antalya",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Isparta",
  "İçel (Mersin)",
  "İstanbul",
  "İzmir",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kırklareli",
  "Kırşehir",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Kahramanmaraş",
  "Mardin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Şanlıurfa",
  "Uşak",
  "Van",
  "Yozgat",
  "Zonguldak",
  "Aksaray",
  "Bayburt",
  "Karaman",
  "Kırıkkale",
  "Batman",
  "Şırnak",
  "Bartın",
  "Ardahan",
  "Iğdır",
  "Yalova",
  "Karabük",
  "Kilis",
  "Osmaniye",
  "Düzce",
];

// Company types
const COMPANY_TYPES = [
  "Limited Şirket",
  "Anonim Şirket",
  "Kollektif Şirket",
  "Komandit Şirket",
  "Şahıs İşletmesi",
  "Diğer",
];

export default function BusinessRegisterPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [taxId, setTaxId] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">
            {locale === "en"
              ? "You are already logged in."
              : "Zaten giriş yapmışsınız."}
          </p>
          <ButtonLink href="/">
            {locale === "en" ? "Go to Home" : "Ana Sayfaya Dön"}
          </ButtonLink>
        </div>
      </div>
    );
  }

  // Registration success screen
  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface-elevated to-warning-50 flex flex-col">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/tarodan-logo.jpg" alt="Tarodan" width={162} height={40} className="rounded-lg object-contain" />
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-success-500/10 p-8 md:p-10 border border-border-subtle text-center"
          >
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-gradient-to-br from-success-100 to-success-100 rounded-full flex items-center justify-center"
              >
                <EnvelopeIcon className="w-10 h-10 text-success-600" />
              </motion.div>
            </div>

            <h2 className="text-2xl font-bold text-heading mb-3">
              {locale === "en"
                ? "Check Your Email! 📬"
                : "E-postanızı Kontrol Edin! 📬"}
            </h2>

            <p className="text-muted mb-2">
              {locale === "en"
                ? "We have sent a verification link to:"
                : "Doğrulama linki gönderildi:"}
            </p>

            <p className="font-semibold text-body mb-6">
              {registeredEmail}
            </p>

            <div className="bg-info-50 border border-info-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-info-800 mb-2">
                📌 {locale === "en" ? "Next steps:" : "Sonraki adımlar:"}
              </p>
              <ol className="text-sm text-info-700 list-decimal list-inside space-y-1">
                <li>
                  {locale === "en"
                    ? "Open your email inbox"
                    : "E-posta kutunuzu açın"}
                </li>
                <li>
                  {locale === "en"
                    ? "Find the email from Tarodan"
                    : "Tarodan'dan gelen e-postayı bulun"}
                </li>
                <li>
                  {locale === "en"
                    ? "Click the verification link"
                    : "Doğrulama linkine tıklayın"}
                </li>
                <li>
                  {locale === "en"
                    ? "Login to your account"
                    : "Hesabınıza giriş yapın"}
                </li>
              </ol>
            </div>

            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full py-3 bg-gradient-to-r from-primary-500 to-warning-500 text-inverted font-semibold rounded-xl hover:from-primary-600 hover:to-warning-600 transition-all"
              >
                {locale === "en" ? "Go to Login" : "Giriş Sayfasına Git"}
              </Link>

              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await api.post("/auth/resend-verification", {
                      email: registeredEmail,
                    });
                    toast.success(
                      locale === "en"
                        ? "Verification email resent!"
                        : "Doğrulama e-postası tekrar gönderildi!",
                    );
                  } catch (error) {
                    toast.error(
                      locale === "en"
                        ? "Could not resend email"
                        : "E-posta gönderilemedi",
                    );
                  }
                }}
                className="block w-full py-3 bg-surface-alt text-body font-medium rounded-xl hover:bg-border-subtle transition-colors"
              >
                {locale === "en"
                  ? "Resend Verification Email"
                  : "Doğrulama E-postasını Tekrar Gönder"}
              </Button>
            </div>
          </motion.div>
        </main>

        <footer className="p-6 text-center">
          <p className="text-sm text-subtle">
            © {new Date().getFullYear()} Tarodan.{" "}
            {locale === "en" ? "All rights reserved." : "Tüm hakları saklıdır."}
          </p>
        </footer>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !companyName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !taxId.trim() ||
      !city.trim() ||
      !password.trim()
    ) {
      toast.error(
        locale === "en"
          ? "Please fill in all required fields"
          : "Lütfen tüm zorunlu alanları doldurun",
      );
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("validation.passwordMatch"));
      return;
    }

    if (password.length < 8) {
      toast.error(
        locale === "en"
          ? "Password must be at least 8 characters"
          : "Şifre en az 8 karakter olmalıdır",
      );
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error(
        locale === "en"
          ? "Password must contain at least one uppercase, one lowercase, and one number"
          : "Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir",
      );
      return;
    }

    if (!agreeTerms) {
      toast.error(
        locale === "en"
          ? "You must accept the terms of service"
          : "Kullanım şartlarını kabul etmelisiniz",
      );
      return;
    }

    // Format phone for API
    const formattedPhone = phone ? "+90" + phone.replace(/\s/g, "") : undefined;

    setIsLoading(true);
    try {
      await api.post("/auth/register/business", {
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
      toast.success(
        locale === "en"
          ? "Registration successful! Please verify your email."
          : "Kayıt başarılı! Lütfen e-postanızı doğrulayın.",
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          (locale === "en" ? "Registration failed" : "Kayıt başarısız"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left - Hero */}
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-12">
        <div className="max-w-lg text-inverted text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-8xl mb-8">🏢</div>
            <h2 className="text-3xl font-bold mb-4">
              {locale === "en" ? "Business Account" : "Şirket Hesabı"}
            </h2>
            <p className="text-border-strong text-lg">
              {locale === "en"
                ? "Create a business account to access advanced features and manage your company listings."
                : "Gelişmiş özelliklere erişmek ve şirket ilanlarınızı yönetmek için şirket hesabı oluşturun."}
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
              <Image src="/tarodan-logo.jpg" alt="Tarodan" width={200} height={49} className="rounded-lg object-contain" />
            </Link>
            <h1 className="text-3xl font-bold text-heading mb-2">
              {locale === "en"
                ? "Business Account Registration"
                : "Şirket Hesabı Kaydı"}
            </h1>
            <p className="text-muted">
              {locale === "en"
                ? "Create your business account"
                : "Şirket hesabınızı oluşturun"}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 bg-surface-elevated rounded-xl shadow-lg p-6 md:p-8"
          >
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {locale === "en" ? "Company Name" : "Şirket İsmi"}{" "}
                <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                <Input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={locale === "en" ? "Company Name" : "Şirket İsmi"}
                  className="rounded-[4px] pl-12"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {t("auth.email")} <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      locale === "en" ? "example@email.com" : "ornek@email.com"
                    }
                    className="rounded-[4px] pl-12"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {t("auth.phone")} <span className="text-danger-500">*</span>
                </label>
                <div className="flex min-w-0 overflow-hidden rounded-xl border border-border bg-surface transition-colors focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 focus-within:ring-offset-1">
                  <span className="inline-flex flex-shrink-0 items-center px-3 bg-surface-alt text-muted font-medium">
                    +90
                  </span>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="5XX XXX XX XX"
                    maxLength={14}
                    className="flex-1 min-w-0 rounded-none border-0 bg-transparent focus:ring-0 focus:ring-offset-0"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "Company Type" : "Şirket Türü"}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle pointer-events-none z-10" />
                  <Select
                    value={companyType}
                    onChange={(e) => setCompanyType(e.target.value)}
                    className="pl-12 appearance-none"
                    required
                  >
                    <option value="">
                      {locale === "en"
                        ? "Select Company Type"
                        : "Şirket Türü Seçin"}
                    </option>
                    {COMPANY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "Tax ID Number" : "Vergi Kimlik Numarası"}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <HashtagIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="text"
                    value={taxId}
                    onChange={(e) =>
                      setTaxId(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder={
                      locale === "en" ? "10-11 digits" : "10-11 haneli"
                    }
                    maxLength={11}
                    className="rounded-[4px] pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "City" : "İl"}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle pointer-events-none z-10" />
                  <Select
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setDistrict(""); // Reset district when city changes
                    }}
                    className="pl-12 appearance-none"
                    required
                  >
                    <option value="">
                      {locale === "en" ? "Select City" : "İl Seçin"}
                    </option>
                    {TURKISH_CITIES.map((cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "District" : "İlçe"}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder={locale === "en" ? "District" : "İlçe"}
                    className="rounded-[4px] pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {t("auth.password")}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type={showPassword ? "text" : "password"} hidePasswordToggle
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-[4px] pl-12 pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (locale === "en" ? "Hide password" : "Şifreyi gizle") : (locale === "en" ? "Show password" : "Şifreyi göster")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {t("auth.confirmPassword")}{" "}
                  <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type={showPassword ? "text" : "password"} hidePasswordToggle
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-[4px] pl-12"
                    required
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 h-5 w-5"
                required
              />
              <span className="text-sm text-muted">
                {locale === "en" ? (
                  <>
                    I have read and accept the{" "}
                    <Link
                      href="/terms"
                      className="text-primary-500 hover:text-primary-600"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-primary-500 hover:text-primary-600"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    <Link
                      href="/terms"
                      className="text-primary-500 hover:text-primary-600"
                    >
                      Kullanım Şartları
                    </Link>{" "}
                    ve{" "}
                    <Link
                      href="/privacy"
                      className="text-primary-500 hover:text-primary-600"
                    >
                      Gizlilik Politikası
                    </Link>
                    'nı okudum ve kabul ediyorum.
                  </>
                )}
              </span>
            </label>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading
                ? locale === "en"
                  ? "Registering..."
                  : "Kayıt yapılıyor..."
                : locale === "en"
                  ? "Register Business Account"
                  : "Şirket Hesabı Oluştur"}
            </Button>
          </form>

          <p className="text-center mt-6 text-muted">
            {locale === "en"
              ? "Already have an account?"
              : "Zaten hesabınız var mı?"}{" "}
            <Link
              href="/login"
              className="text-primary-500 font-semibold hover:text-primary-600"
            >
              {t("common.login")}
            </Link>
          </p>

          <p className="text-center mt-4 text-muted">
            {locale === "en" ? "Not a business?" : "Şirket değil misiniz?"}{" "}
            <Link
              href="/register"
              className="text-primary-500 font-semibold hover:text-primary-600"
            >
              {locale === "en" ? "Register as Individual" : "Bireysel Kayıt Ol"}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
