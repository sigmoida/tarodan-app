'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { loginAction } from '@/lib/server/auth-actions';
import type { LoginValues } from '@/lib/schemas/auth';

/**
 * Client wrapper around the login Server Action. The action verifies the
 * credentials and sets the httpOnly session cookies server-side. Form state
 * (pending / field errors) is owned by the form; this hook only tracks the
 * 2FA step and returns a form-level error message.
 */
export function useLogin() {
  const router = useRouter();
  const t = useTranslations();
  const [requires2FA, setRequires2FA] = useState(false);

  /** Returns a form-level error message, or null on success / next step. */
  const login = async (values: LoginValues): Promise<string | null> => {
    const result = await loginAction(values);
    if (result.status === '2fa') {
      setRequires2FA(true);
      toast.success(t('admin.auth.login.twoFactorRequired'));
      return null;
    }
    if (result.status === 'error') {
      return result.message;
    }
    // Success: client-navigate (not a hard reload) so the transition shows the
    // root loading spinner while the (admin) layout re-reads the fresh session
    // server-side, instead of a blank screen. refresh() drops any stale RSC cache.
    router.replace('/dashboard');
    router.refresh();
    return null;
  };

  return { login, requires2FA };
}
