'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button, Spinner } from '@tarodan/ui';
import { Form, FormInput, FormCheckbox, FormError, useZodForm } from '@tarodan/ui/form';
import { registerSchema, type RegisterValues } from '@/lib/schemas/auth';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useRegister } from '@/hooks/useRegister';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordChecklist } from './PasswordChecklist';

export function RegisterForm() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { registrationSuccess, registeredEmail, submit, resendVerification } = useRegister();

  // authStore ilk client render'da (giriş yapmamış kullanıcı) isLoading=false
  // verirken server isLoading=true verir; bu fark hydration hatasına yol
  // açıyordu. mounted guard'ı ile server + client ilk render aynı (Spinner)
  // kalır, gerçek duruma mount sonrası geçilir.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const form = useZodForm(registerSchema(locale), {
    defaultValues: {
      displayName: '',
      email: '',
      phone: '',
      birthDate: '',
      password: '',
      confirmPassword: '',
      agreeTerms: false,
      acceptsMarketingEmails: false,
    },
  });

  const onSubmit = (v: RegisterValues) =>
    submit({
      displayName: v.displayName,
      email: v.email,
      phone: v.phone ?? '',
      birthDate: v.birthDate,
      password: v.password,
      confirmPassword: v.confirmPassword,
      agreeTerms: v.agreeTerms,
      acceptMarketing: v.acceptsMarketingEmails,
    });

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

  if (!mounted || (authLoading && !isAuthenticated)) {
    return <Spinner size="lg" />;
  }

  if (isAuthenticated) {
    return (
      <AuthCard
        title={locale === 'en' ? 'Already signed in' : 'Zaten giriş yaptınız'}
        description={locale === 'en' ? 'You are already logged in.' : 'Zaten giriş yapmışsınız.'}
      >
        <Button className="w-full" onClick={() => router.push('/')}>
          {locale === 'en' ? 'Go to Home' : 'Ana Sayfaya Dön'}
        </Button>
      </AuthCard>
    );
  }

  if (registrationSuccess) {
    return (
      <AuthCard
        title={locale === 'en' ? 'Almost There!' : 'Neredeyse Tamam!'}
        description={
          <>
            {locale === 'en' ? 'We sent a verification link to ' : 'Doğrulama linki gönderildi: '}
            <span className="font-semibold text-body">{registeredEmail}</span>
          </>
        }
        footer={
          <Link href="/verify-email" className="font-semibold text-primary-600 hover:text-primary-700">
            {locale === 'en'
              ? 'Need to verify later? Go to verification page'
              : 'Daha sonra mı doğrulayacaksınız? Doğrulama sayfasına gidin'}
          </Link>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {locale === 'en'
              ? "Can't find it? Check your spam/junk folder. The verification link expires in 24 hours."
              : 'Bulamıyor musunuz? Spam/Gereksiz klasörünü kontrol edin. Doğrulama linki 24 saat geçerlidir.'}
          </p>
          <Button className="w-full" onClick={() => router.push('/login')}>
            {locale === 'en' ? 'Go to Login' : 'Giriş Sayfasına Git'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={resendVerification}>
            {locale === 'en' ? 'Resend Verification Email' : 'Doğrulama E-postasını Tekrar Gönder'}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.createAccount')}
      description={locale === 'en' ? 'Join the collectors community' : 'Koleksiyonerler topluluğuna katılın'}
      footer={
        <>
          {t('auth.hasAccount')}{' '}
          <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            {t('common.login')}
          </Link>
          <span className="mt-3 block border-t border-border pt-3">
            <Link href="/register/business" className="font-medium text-body hover:text-primary-600">
              {locale === 'en' ? 'Open Business Account' : 'Şirket Hesabı Aç'}
            </Link>
          </span>
        </>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="displayName"
          label={`${locale === 'en' ? 'Full Name' : 'Ad Soyad'} *`}
          placeholder={locale === 'en' ? 'Your Full Name' : 'Adınız Soyadınız'}
          autoComplete="name"
        />

        <FormInput
          name="email"
          type="email"
          label={`${t('auth.email')} *`}
          placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
          autoComplete="email"
        />

        <FormInput
          name="phone"
          type="tel"
          label={t('auth.phone')}
          placeholder="5XX XXX XX XX"
          autoComplete="tel"
        />

        <FormInput
          name="birthDate"
          type="date"
          label={`${t('auth.birthDate')} *`}
          max={getMaxBirthDate()}
        />

        <FormInput
          name="password"
          type="password"
          label={`${t('auth.password')} *`}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <PasswordChecklist password={form.watch('password')} locale={locale} />

        <FormInput
          name="confirmPassword"
          type="password"
          label={`${t('auth.confirmPassword')} *`}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <FormCheckbox
          name="agreeTerms"
          label={
            <span className="text-sm text-muted leading-snug">
              {locale === 'en' ? (
                <>
                  I accept the{' '}
                  <Link href="/terms" className="font-medium text-primary-600 hover:text-primary-700">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="font-medium text-primary-600 hover:text-primary-700">Privacy Policy</Link>.
                </>
              ) : (
                <>
                  <Link href="/terms" className="font-medium text-primary-600 hover:text-primary-700">Kullanım Şartları</Link>
                  {' '}ve{' '}
                  <Link href="/privacy" className="font-medium text-primary-600 hover:text-primary-700">Gizlilik Politikası</Link>
                  &apos;nı okudum ve kabul ediyorum.
                </>
              )}
            </span>
          }
        />

        <FormCheckbox
          name="acceptsMarketingEmails"
          label={locale === 'en'
            ? 'I want to receive promotional emails and special offers.'
            : 'Reklam ve kampanya e-postalarını almak istiyorum.'}
        />

        <FormError />

        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
          {t('common.register')}
        </Button>

        <GoogleSignInButton onSuccess={() => router.push('/')} />
      </Form>
    </AuthCard>
  );
}
