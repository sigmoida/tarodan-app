'use client';

import { useState } from 'react';
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
  const [requires2FA, setRequires2FA] = useState(false);

  /** Returns a form-level error message, or null on success / next step. */
  const login = async (values: LoginValues): Promise<string | null> => {
    const result = await loginAction(values);
    if (result.status === '2fa') {
      setRequires2FA(true);
      toast.success('İki faktörlü doğrulama kodu gerekli');
      return null;
    }
    if (result.status === 'error') {
      return result.message;
    }
    // Success: hard-navigate so the (admin) layout re-reads the fresh session.
    window.location.href = '/dashboard';
    return null;
  };

  return { login, requires2FA };
}
