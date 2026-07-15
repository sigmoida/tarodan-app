'use client';

import Link from 'next/link';
import { Button } from '@tarodan/ui';
import { Form, FormInput, FormError, useZodForm } from '@tarodan/ui/form';
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from './AuthCard';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../_lib/auth';
import { useForgotPassword } from '../_hooks/useForgotPassword';

export function ForgotPasswordForm() {
  const locale = useLocale();
  const { submit, sent, reset } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema(locale), { defaultValues: { email: '' } });

  const onSubmit = (values: ForgotPasswordValues) => submit(values.email);

  if (sent) {
    return (
      <AuthCard
        title={locale === 'tr' ? 'E-posta Gönderildi!' : 'Email Sent!'}
        description={
          <>
            {locale === 'tr'
              ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
              : 'A password reset link has been sent to your email.'}{' '}
            <strong className="text-heading">{form.getValues('email')}</strong>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <p className="text-sm text-warning-800">
              {locale === 'tr'
                ? 'E-postanızı bulamıyor musunuz? Spam/Gereksiz klasörünüzü kontrol edin.'
                : "Can't find the email? Check your spam/junk folder."}
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">{locale === 'tr' ? 'Giriş Sayfasına Dön' : 'Back to Login'}</Link>
          </Button>

          <Button variant="secondary" onClick={reset} className="w-full">
            {locale === 'tr' ? 'Farklı E-posta Dene' : 'Try Different Email'}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={locale === 'tr' ? 'Şifrenizi mi unuttunuz?' : 'Forgot your password?'}
      description={
        locale === 'tr'
          ? 'Endişelenmeyin! E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'
          : "Don't worry! Enter your email and we'll send you a reset link."
      }
      backHref="/login"
      backLabel={locale === 'tr' ? 'Giriş sayfasına dön' : 'Back to login'}
      footer={
        <>
          {locale === 'tr' ? 'Hesabınız yok mu?' : "Don't have an account?"}{' '}
          <Link href="/register" className="font-semibold text-primary-600 hover:text-primary-700">
            {locale === 'tr' ? 'Kayıt olun' : 'Sign up'}
          </Link>
        </>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="email"
          type="email"
          label={locale === 'tr' ? 'E-posta Adresi' : 'Email Address'}
          placeholder="ornek@email.com"
          autoFocus
        />

        <FormError />

        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
          {locale === 'tr' ? 'Sıfırlama Bağlantısı Gönder' : 'Send Reset Link'}
        </Button>
      </Form>
    </AuthCard>
  );
}
