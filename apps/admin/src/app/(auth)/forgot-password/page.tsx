import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { APP_NAME } from '@/lib/navigation';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: `${t('admin.auth.forgotPassword.title')} - ${APP_NAME}`,
    description: t('admin.auth.forgotPassword.pageDescription'),
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
