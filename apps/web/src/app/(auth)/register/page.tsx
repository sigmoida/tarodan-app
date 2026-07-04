import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Kayıt Ol · Tarodan',
  description: 'Tarodan koleksiyoner topluluğuna ücretsiz üye olun.',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
