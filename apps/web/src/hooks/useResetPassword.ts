'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

/**
 * Reset-password flow. Reads the reset `token` from the URL, posts the new
 * password, and flips to the success view. Returns a form-level error message
 * on failure (also toasted); the form owns its pending state.
 */
export function useResetPassword() {
  const token = useSearchParams().get('token');
  const [success, setSuccess] = useState(false);

  const submit = async (newPassword: string, locale: string): Promise<string | null> => {
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setSuccess(true);
      toast.success(locale === 'tr' ? 'Şifreniz başarıyla değiştirildi!' : 'Password changed successfully!');
      return null;
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Failed to reset password:', error);
      }
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (locale === 'tr' ? 'Şifre sıfırlama başarısız' : 'Password reset failed');
      toast.error(msg);
      return msg;
    }
  };

  return { token, success, submit };
}
