'use client';

import Link from 'next/link';
import { Button, Spinner } from '@tarodan/ui';
import { Form, FormInput, FormError, useZodForm } from '@tarodan/ui/form';
import { useTranslation } from '@/i18n/LanguageContext';
import { AuthCard } from './AuthCard';
import { useVerifyEmail } from '../_hooks/useVerifyEmail';
import { resendEmailSchema, type ResendEmailValues } from '../_lib/auth';

export function VerifyEmailForm() {
  const { locale } = useTranslation();
  const { status, errorMessage, resend, resendLoading, resendSuccess } = useVerifyEmail(locale);
  const form = useZodForm(resendEmailSchema(locale), { defaultValues: { email: '' } });

  const onSubmit = (values: ResendEmailValues) => resend(values.email);

  const resendForm = (
    <Form form={form} onSubmit={onSubmit} className="space-y-3">
      <FormInput
        name="email"
        type="email"
        label={locale === 'tr' ? 'E-posta' : 'Email'}
        placeholder="ornek@email.com"
      />
      <FormError />
      <Button type="submit" isLoading={resendLoading} className="w-full">
        {locale === 'tr' ? 'Yeniden doğrulama e-postası gönder' : 'Resend verification email'}
      </Button>
      {resendSuccess && (
        <p className="text-center text-sm text-success-600">
          {locale === 'tr'
            ? 'E-posta gönderildi. Gelen kutunuzu kontrol edin.'
            : 'Email sent. Check your inbox.'}
        </p>
      )}
    </Form>
  );

  if (status === 'loading') {
    return (
      <AuthCard
        title={locale === 'tr' ? 'E-posta Doğrulanıyor...' : 'Verifying Email...'}
        description={locale === 'tr' ? 'Lütfen bekleyin...' : 'Please wait...'}
      >
        <div className="flex justify-center py-4">
          <Spinner size="lg" />
        </div>
      </AuthCard>
    );
  }

  if (status === 'success') {
    return (
      <AuthCard
        title={locale === 'tr' ? 'E-posta Doğrulandı!' : 'Email Verified!'}
        description={
          locale === 'tr'
            ? 'E-posta adresiniz başarıyla doğrulandı. Artık hesabınıza giriş yapabilirsiniz.'
            : 'Your email has been successfully verified. You can now login to your account.'
        }
      >
        <div className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/login">{locale === 'tr' ? 'Giriş Yap' : 'Login Now'}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (status === 'error') {
    return (
      <AuthCard
        title={locale === 'tr' ? 'Doğrulama Başarısız' : 'Verification Failed'}
        description={errorMessage}
        footer={
          <>
            <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
              {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
            </Link>
            {' · '}
            <Link
              href="/register"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {locale === 'tr' ? 'Yeniden Kayıt Ol' : 'Register Again'}
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <p className="text-sm text-warning-800">
              {locale === 'tr'
                ? 'Bağlantının süresi dolmuş olabilir. Yeni bir doğrulama e-postası isteyebilirsiniz.'
                : 'The link may have expired. You can request a new verification email.'}
            </p>
          </div>

          {resendForm}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={locale === 'tr' ? 'E-posta Doğrulama' : 'Email Verification'}
      description={
        locale === 'tr'
          ? 'E-postanızdaki doğrulama linkine tıklayarak hesabınızı aktifleştirin.'
          : 'Click the verification link in your email to activate your account.'
      }
      footer={
        <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
          {locale === 'tr' ? 'Giriş Sayfasına Git' : 'Go to Login'}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-info-200 bg-info-50 p-4">
          <p className="text-sm text-info-800">
            {locale === 'tr'
              ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin veya yeni doğrulama e-postası isteyin.'
              : "Can't find the email? Check your spam/junk folder or request a new verification email."}
          </p>
        </div>

        {resendForm}
      </div>
    </AuthCard>
  );
}
