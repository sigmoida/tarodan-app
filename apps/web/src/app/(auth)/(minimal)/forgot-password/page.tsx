import type { Metadata } from 'next';
import QueryProvider from '@/components/QueryProvider';
import { ForgotPasswordForm } from '../../_components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Şifremi Unuttum · Tarodan',
  description: 'Tarodan hesap şifrenizi sıfırlayın',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <QueryProvider>
      <ForgotPasswordForm />
    </QueryProvider>
  );
}
