'use client';
import { useCallback } from 'react';
import Script from 'next/script';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

const SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

declare global {
  interface Window {
    AppleID?: any;
  }
}

export function AppleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const loginWithApple = useAuthStore((s) => s.loginWithApple);

  const handleClick = useCallback(async () => {
    if (typeof window === 'undefined' || !window.AppleID) {
      toast.error('Apple girişi yüklenemedi');
      return;
    }
    try {
      window.AppleID.auth.init({
        clientId: SERVICES_ID,
        redirectURI: REDIRECT_URI,
        scope: 'name email',
        usePopup: true,
      });
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) {
        toast.error('Apple ile giriş başarısız');
        return;
      }
      const name = data?.user?.name;
      const fullName = name
        ? [name.firstName, name.lastName].filter(Boolean).join(' ') || undefined
        : undefined;
      await loginWithApple(idToken, fullName);
      onSuccess?.();
    } catch (e: any) {
      // Kullanıcı popup'ı kapattı → sessiz geç.
      if (e?.error === 'popup_closed_by_user') return;
      toast.error(e?.response?.data?.message || 'Apple ile giriş başarısız');
    }
  }, [loginWithApple, onSuccess]);

  // Servis ID / redirect yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!SERVICES_ID || !REDIRECT_URI) return null;

  return (
    <>
      <Script src={APPLE_JS} strategy="afterInteractive" />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleClick}
          aria-label="Apple ile devam et"
          className="flex items-center justify-center gap-2 h-11 rounded-md bg-black text-white font-semibold"
          style={{ width: 320 }}
        >
          <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Apple ile devam et
        </button>
      </div>
    </>
  );
}
