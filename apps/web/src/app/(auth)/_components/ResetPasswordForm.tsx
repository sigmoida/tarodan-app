'use client';

import Link from 'next/link';
import { Button } from '@tarodan/ui';
import { Form, FormInput, FormError, useZodForm } from '@tarodan/ui/form';
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from './AuthCard';
import { resetPasswordSchema, type ResetPasswordValues } from '../_lib/auth';
import { useResetPassword } from '../_hooks/useResetPassword';
import { PasswordChecklist } from './PasswordChecklist';

export function ResetPasswordForm() {
  const locale = useLocale();
  const { token, success, submit } = useResetPassword();

  const form = useZodForm(resetPasswordSchema(locale), {
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { watch, setError } = form;
  const password = watch('password');

  const onSubmit = async (values: ResetPasswordValues) => {
    const err = await submit(values.password, locale);
    if (err) setError('root', { message: err });
  };

  // Token Error State
  if (!token) {
    return (
      <AuthCard
        title={locale === 'tr' ? 'Geçersiz Bağlantı' : 'Invalid Link'}
        description={
          locale === 'tr'
            ? 'Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş olabilir. Lütfen yeni bir bağlantı isteyin.'
            : 'This password reset link is invalid or may have expired. Please request a new one.'
        }
      >
        <Button asChild className="w-full">
          <Link href="/forgot-password">
            {locale === 'tr' ? 'Yeni Bağlantı İste' : 'Request New Link'}
          </Link>
        </Button>
      </AuthCard>
    );
  }

  // Success State
  if (success) {
    return (
      <AuthCard
        title={locale === 'tr' ? 'Şifreniz Değiştirildi!' : 'Password Changed!'}
        description={
          locale === 'tr'
            ? 'Şifreniz başarıyla güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.'
            : 'Your password has been successfully updated. You can now login with your new password.'
        }
      >
        <Button asChild className="w-full">
          <Link href="/login">{locale === 'tr' ? 'Giriş Yap' : 'Login Now'}</Link>
        </Button>
      </AuthCard>
    );
  }

  // Main Form
  return (
    <AuthCard
      title={locale === 'tr' ? 'Yeni Şifre Oluştur' : 'Create New Password'}
      description={
        locale === 'tr'
          ? 'Güçlü bir şifre seçin ve hesabınızı güvende tutun.'
          : 'Choose a strong password to keep your account secure.'
      }
      backHref="/login"
      backLabel={locale === 'tr' ? 'Giriş sayfasına dön' : 'Back to login'}
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="password"
          type="password"
          label={locale === 'tr' ? 'Yeni Şifre' : 'New Password'}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <PasswordChecklist password={password} locale={locale} />

        <FormInput
          name="confirmPassword"
          type="password"
          label={locale === 'tr' ? 'Şifreyi Onayla' : 'Confirm Password'}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <FormError />

        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
          {locale === 'tr' ? 'Şifremi Değiştir' : 'Change Password'}
        </Button>
      </Form>
    </AuthCard>
  );
}
