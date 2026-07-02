'use client';

import { useState } from 'react';
import { loginAction, type LoginInput } from '@/lib/server/auth-actions';

/**
 * Client wrapper around the login Server Action. The action verifies
 * credentials and sets the httpOnly session cookies server-side; this hook
 * only tracks pending / 2FA / error state so the form stays thin.
 */
export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (values: LoginInput) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await loginAction(values);
      if (result.status === '2fa') {
        setRequires2FA(true);
        return;
      }
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      // Success: hard-navigate so the (admin) layout re-reads the fresh session.
      window.location.href = '/dashboard';
    } finally {
      setIsLoading(false);
    }
  };

  return { login, isLoading, requires2FA, error };
}

export type { LoginInput as LoginValues };
