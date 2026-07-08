'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

/**
 * Forgot-password flow. Posts the reset request and flips to the "sent" view.
 * Deliberately reports success even on error — never leak whether an email is
 * registered. The form owns its pending state (via isSubmitting).
 */
export function useForgotPassword() {
  const [sent, setSent] = useState(false);

  const submit = async (email: string) => {
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Failed to request password reset:', error);
      }
      // Always show success for security reasons.
    } finally {
      setSent(true);
    }
  };

  const reset = () => setSent(false);

  return { submit, sent, reset };
}
