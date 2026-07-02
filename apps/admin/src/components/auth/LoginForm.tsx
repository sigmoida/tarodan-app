'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@tarodan/ui';
import { useLogin, type LoginValues } from '@/hooks/useLogin';
import { AuthCard } from './AuthCard';

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function LoginForm() {
  const { login, isLoading, requires2FA, error } = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>();

  return (
    <AuthCard title="Giriş Yap">
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(login)} className="space-y-6">
        <Input
          label="E-posta"
          type="email"
          placeholder="admin@tarodan.com"
          error={errors.email?.message}
          {...register('email', {
            required: 'E-posta gerekli',
            pattern: { value: EMAIL_PATTERN, message: 'Geçerli bir e-posta girin' },
          })}
        />

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
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password', {
              required: 'Şifre gerekli',
              minLength: { value: 6, message: 'Şifre en az 6 karakter olmalı' },
            })}
          />
        </div>

        {requires2FA && (
          <Input
            label="Doğrulama Kodu"
            type="text"
            placeholder="000000"
            maxLength={6}
            error={errors.twoFactorCode?.message}
            {...register('twoFactorCode', {
              required: requires2FA ? 'Doğrulama kodu gerekli' : false,
              pattern: { value: /^\d{6}$/, message: '6 haneli kod girin' },
            })}
          />
        )}

        <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
          Giriş Yap
        </Button>
      </form>
    </AuthCard>
  );
}
