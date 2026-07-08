'use client';

import { useState } from 'react';
import { forgotPasswordAction } from '@/lib/server/auth-actions';

/**
 * Client wrapper around the forgot-password Server Action. The form owns the
 * pending state (via isSubmitting); this hook just flips to the "sent" view.
 */
export function useForgotPassword() {
  const [sent, setSent] = useState(false);

  const submit = async (email: string) => {
    await forgotPasswordAction(email);
    setSent(true);
  };

  return { submit, sent };
}
