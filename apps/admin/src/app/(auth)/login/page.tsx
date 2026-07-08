import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Giriş - Tarodan Admin',
  description: 'Tarodan yönetim paneline giriş yapın',
};

export default function LoginPage() {
  return <LoginForm />;
}
