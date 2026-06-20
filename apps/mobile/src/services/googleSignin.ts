import { GoogleSignin } from '@react-native-google-signin/google-signin';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  configured = true;
}

/** Google ile giriş; backend'e gönderilecek idToken döner. */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const result: any = await GoogleSignin.signIn();
  const idToken = result?.idToken ?? result?.data?.idToken;
  if (!idToken) throw new Error('Google idToken alınamadı');
  return idToken;
}

export function isGoogleConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}
