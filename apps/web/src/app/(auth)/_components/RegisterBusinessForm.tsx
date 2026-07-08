'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button } from '@tarodan/ui';
import { Form, FormInput, FormSelect, FormCheckbox, FormError, useZodForm } from '@tarodan/ui/form';
import { businessRegisterSchema, type BusinessRegisterValues } from '../_lib/auth';
import { AuthCard } from './AuthCard';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useRegisterBusiness } from '../_hooks/useRegisterBusiness';

// Turkish cities (major ones)
const TURKISH_CITIES = [
  'Adana',
  'Adıyaman',
  'Afyonkarahisar',
  'Ağrı',
  'Amasya',
  'Ankara',
  'Antalya',
  'Artvin',
  'Aydın',
  'Balıkesir',
  'Bilecik',
  'Bingöl',
  'Bitlis',
  'Bolu',
  'Burdur',
  'Bursa',
  'Çanakkale',
  'Çankırı',
  'Çorum',
  'Denizli',
  'Diyarbakır',
  'Edirne',
  'Elazığ',
  'Erzincan',
  'Erzurum',
  'Eskişehir',
  'Gaziantep',
  'Giresun',
  'Gümüşhane',
  'Hakkari',
  'Hatay',
  'Isparta',
  'İçel (Mersin)',
  'İstanbul',
  'İzmir',
  'Kars',
  'Kastamonu',
  'Kayseri',
  'Kırklareli',
  'Kırşehir',
  'Kocaeli',
  'Konya',
  'Kütahya',
  'Malatya',
  'Manisa',
  'Kahramanmaraş',
  'Mardin',
  'Muğla',
  'Muş',
  'Nevşehir',
  'Niğde',
  'Ordu',
  'Rize',
  'Sakarya',
  'Samsun',
  'Siirt',
  'Sinop',
  'Sivas',
  'Tekirdağ',
  'Tokat',
  'Trabzon',
  'Tunceli',
  'Şanlıurfa',
  'Uşak',
  'Van',
  'Yozgat',
  'Zonguldak',
  'Aksaray',
  'Bayburt',
  'Karaman',
  'Kırıkkale',
  'Batman',
  'Şırnak',
  'Bartın',
  'Ardahan',
  'Iğdır',
  'Yalova',
  'Karabük',
  'Kilis',
  'Osmaniye',
  'Düzce',
];

// Company types
const COMPANY_TYPES = [
  'Limited Şirket',
  'Anonim Şirket',
  'Kollektif Şirket',
  'Komandit Şirket',
  'Şahıs İşletmesi',
  'Diğer',
];

export function RegisterBusinessForm() {
  const { t, locale } = useTranslation();
  const { registrationSuccess, registeredEmail, submit, resendVerification } = useRegisterBusiness();

  const form = useZodForm(businessRegisterSchema(locale), {
    defaultValues: {
      companyName: '',
      email: '',
      phone: '',
      companyType: '',
      taxId: '',
      city: '',
      district: '',
      password: '',
      confirmPassword: '',
      agreeTerms: false,
    },
  });

  // City → district cascade: whenever the selected city changes, clear the
  // district so a stale value can't outlive its city (matches the original).
  const city = form.watch('city');
  useEffect(() => {
    form.setValue('district', '');
  }, [city, form]);

  // Registration success screen
  if (registrationSuccess) {
    return (
      <AuthCard
        title={locale === 'en' ? 'Check Your Email!' : 'E-postanızı Kontrol Edin!'}
        description={
          locale === 'en'
            ? 'We have sent a verification link to:'
            : 'Doğrulama linki gönderildi:'
        }
      >
        <p className="font-semibold text-body">{registeredEmail}</p>

        <div className="mt-4 rounded-xl border border-info-200 bg-info-50 p-4">
          <p className="mb-2 text-sm text-info-800">
            {locale === 'en' ? 'Next steps:' : 'Sonraki adımlar:'}
          </p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-info-700">
            <li>{locale === 'en' ? 'Open your email inbox' : 'E-posta kutunuzu açın'}</li>
            <li>
              {locale === 'en'
                ? 'Find the email from Tarodan'
                : "Tarodan'dan gelen e-postayı bulun"}
            </li>
            <li>
              {locale === 'en' ? 'Click the verification link' : 'Doğrulama linkine tıklayın'}
            </li>
            <li>{locale === 'en' ? 'Login to your account' : 'Hesabınıza giriş yapın'}</li>
          </ol>
        </div>

        <div className="mt-6 space-y-3">
          <ButtonLink href="/login" className="w-full">
            {locale === 'en' ? 'Go to Login' : 'Giriş Sayfasına Git'}
          </ButtonLink>

          <Button variant="secondary" onClick={resendVerification} className="w-full">
            {locale === 'en'
              ? 'Resend Verification Email'
              : 'Doğrulama E-postasını Tekrar Gönder'}
          </Button>
        </div>
      </AuthCard>
    );
  }

  const onSubmit = (values: BusinessRegisterValues) =>
    submit({
      companyName: values.companyName,
      email: values.email,
      phone: values.phone,
      companyType: values.companyType ?? '',
      taxId: values.taxId,
      city: values.city,
      district: values.district ?? '',
      password: values.password,
      confirmPassword: values.confirmPassword,
      agreeTerms: values.agreeTerms,
    });

  return (
    <AuthCard
      title={locale === 'en' ? 'Business Account Registration' : 'Şirket Hesabı Kaydı'}
      description={
        locale === 'en' ? 'Create your business account' : 'Şirket hesabınızı oluşturun'
      }
      footer={
        <>
          <p>
            {locale === 'en' ? 'Already have an account?' : 'Zaten hesabınız var mı?'}{' '}
            <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
              {t('common.login')}
            </Link>
          </p>
          <p className="mt-2">
            {locale === 'en' ? 'Not a business?' : 'Şirket değil misiniz?'}{' '}
            <Link
              href="/register"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {locale === 'en' ? 'Register as Individual' : 'Bireysel Kayıt Ol'}
            </Link>
          </p>
        </>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="companyName"
          label={`${locale === 'en' ? 'Company Name' : 'Şirket İsmi'} *`}
          placeholder={locale === 'en' ? 'Company Name' : 'Şirket İsmi'}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="email"
            type="email"
            label={`${t('auth.email')} *`}
            placeholder={locale === 'en' ? 'example@email.com' : 'ornek@email.com'}
          />

          <FormInput
            name="phone"
            label={`${t('auth.phone')} *`}
            placeholder="5XX XXX XX XX"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormSelect
            name="companyType"
            label={`${locale === 'en' ? 'Company Type' : 'Şirket Türü'} *`}
          >
            <option value="">
              {locale === 'en' ? 'Select Company Type' : 'Şirket Türü Seçin'}
            </option>
            {COMPANY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </FormSelect>

          <FormInput
            name="taxId"
            label={`${locale === 'en' ? 'Tax ID Number' : 'Vergi Kimlik Numarası'} *`}
            placeholder={locale === 'en' ? '10-11 digits' : '10-11 haneli'}
            inputMode="numeric"
            maxLength={11}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormSelect name="city" label={`${locale === 'en' ? 'City' : 'İl'} *`}>
            <option value="">{locale === 'en' ? 'Select City' : 'İl Seçin'}</option>
            {TURKISH_CITIES.map((cityName) => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
          </FormSelect>

          <FormInput
            name="district"
            label={`${locale === 'en' ? 'District' : 'İlçe'} *`}
            placeholder={locale === 'en' ? 'District' : 'İlçe'}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="password"
            type="password"
            label={`${t('auth.password')} *`}
            placeholder="••••••••"
          />

          <FormInput
            name="confirmPassword"
            type="password"
            label={`${t('auth.confirmPassword')} *`}
            placeholder="••••••••"
          />
        </div>

        <FormCheckbox
          name="agreeTerms"
          label={
            locale === 'en' ? (
              <>
                I have read and accept the{' '}
                <Link href="/terms" className="text-primary-600 hover:text-primary-700">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary-600 hover:text-primary-700">
                  Privacy Policy
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/terms" className="text-primary-600 hover:text-primary-700">
                  Kullanım Şartları
                </Link>{' '}
                ve{' '}
                <Link href="/privacy" className="text-primary-600 hover:text-primary-700">
                  Gizlilik Politikası
                </Link>
                &apos;nı okudum ve kabul ediyorum.
              </>
            )
          }
        />

        <FormError />

        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
          {locale === 'en' ? 'Register Business Account' : 'Şirket Hesabı Oluştur'}
        </Button>
      </Form>
    </AuthCard>
  );
}
