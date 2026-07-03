'use client';

import Link from 'next/link';
import { Button, Form, FormError, FormInput, useZodForm } from '@tarodan/ui';
import { loginSchema, type LoginValues } from '@/lib/schemas/auth';
import { useLogin } from '@/hooks/useLogin';
import { AuthCard } from './AuthCard';

export function LoginForm() {
  const { login, requires2FA } = useLogin();
  const form = useZodForm(loginSchema, {
    defaultValues: { email: '', password: '', twoFactorCode: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    const error = await login(values);
    if (error) form.setError('root', { message: error });
  };

  return (
    <AuthCard title="Giriş Yap">
      <Form form={form} onSubmit={onSubmit} className="space-y-6">
        <FormError />

        <FormInput name="email" label="E-posta" type="email" placeholder="admin@tarodan.com" />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-body">
              Şifre
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Şifremi unuttum?
            </Link>
          </div>
          <FormInput id="password" name="password" type="password" placeholder="••••••••" />
        </div>

        {requires2FA && (
          <FormInput name="twoFactorCode" label="Doğrulama Kodu" placeholder="000000" maxLength={6} />
        )}

        <Button
          type="submit"
          size="lg"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          Giriş Yap
        </Button>
      </Form>
    </AuthCard>
  );
}
