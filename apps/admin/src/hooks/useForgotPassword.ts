'use client';

import { useState } from 'react';
import { forgotPasswordAction } from '@/lib/server/auth-actions';

/**
 * Client wrapper around the forgot-password Server Action. Always reports
 * success (the action never leaks whether the email is registered).
 */
export function useForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (email: string) => {
    if (!email) return;
    setIsLoading(true);
    try {
      await forgotPasswordAction(email);
    } finally {
      setIsLoading(false);
      setSent(true);
    }
  };

  return { submit, isLoading, sent };
}
