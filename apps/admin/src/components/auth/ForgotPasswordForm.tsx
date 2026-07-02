'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Input } from '@tarodan/ui';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import { AuthCard } from './AuthCard';

export function ForgotPasswordForm() {
  const { submit, isLoading, sent } = useForgotPassword();
  const [email, setEmail] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(email);
  };

  return (
    <AuthCard title="Şifremi Unuttum">
      {sent ? (
        <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
          Eğer <strong>{email}</strong> sistemde kayıtlıysa, şifre sıfırlama bağlantısı
          e-posta adresine gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <p className="text-sm text-muted">
            Hesabının e-posta adresini gir; sana şifre sıfırlama bağlantısı gönderelim.
          </p>
          <Input
            label="E-posta"
            type="email"
            placeholder="admin@tarodan.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
            Sıfırlama bağlantısı gönder
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 block text-center text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        ← Girişe dön
      </Link>
    </AuthCard>
  );
}
