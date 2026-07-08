import type { Metadata } from 'next';
import QueryProvider from '@/components/QueryProvider';
import { RegisterBusinessForm } from '../../../_components/RegisterBusinessForm';

export const metadata: Metadata = {
  title: 'Şirket Hesabı Kaydı · Tarodan',
  description: 'Tarodan şirket hesabınızı oluşturun.',
  robots: { index: false, follow: false },
};

export default function BusinessRegisterPage() {
  return (
    <QueryProvider>
      <RegisterBusinessForm />
    </QueryProvider>
  );
}
