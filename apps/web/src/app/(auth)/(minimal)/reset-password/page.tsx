import type { Metadata } from 'next';
import { Suspense } from 'react';
import QueryProvider from '@/components/QueryProvider';
import { ResetPasswordForm } from '../../_components/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Şifre Sıfırla · Tarodan',
  description: 'Yeni Tarodan hesap şifrenizi oluşturun',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <QueryProvider>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </QueryProvider>
  );
}
