'use client';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  // Client ID yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (cred) => {
          if (!cred.credential) {
            toast.error('Google girişi başarısız');
            return;
          }
          try {
            await loginWithGoogle(cred.credential);
            onSuccess?.();
          } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Google ile giriş başarısız');
          }
        }}
        onError={() => toast.error('Google girişi başarısız')}
        text="continue_with"
        shape="rectangular"
        width="320"
      />
    </div>
  );
}
