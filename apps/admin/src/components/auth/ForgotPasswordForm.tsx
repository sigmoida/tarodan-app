'use client';

import Link from 'next/link';
import { Button } from '@tarodan/ui';
import { Form, FormInput, useZodForm } from '@tarodan/ui/form';
import { forgotPasswordSchema } from '@/lib/schemas/auth';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import { AuthCard } from './AuthCard';

export function ForgotPasswordForm() {
  const { submit, sent } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });

  return (
    <AuthCard title="Şifremi Unuttum">
      {sent ? (
        <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
          Eğer <strong>{form.getValues('email')}</strong> sistemde kayıtlıysa, şifre sıfırlama
          bağlantısı e-posta adresine gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.
        </div>
      ) : (
        <Form form={form} onSubmit={(values) => submit(values.email)} className="space-y-6">
          <p className="text-sm text-muted">
            Hesabının e-posta adresini gir; sana şifre sıfırlama bağlantısı gönderelim.
          </p>
          <FormInput name="email" label="E-posta" type="email" placeholder="admin@tarodan.com" />
          <Button
            type="submit"
            size="lg"
            isLoading={form.formState.isSubmitting}
            className="w-full"
          >
            Sıfırlama bağlantısı gönder
          </Button>
        </Form>
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
