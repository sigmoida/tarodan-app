import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * Apple ile giriş bu platformda yapılabilir mi?
 * Buton yalnızca true ise gösterilmeli (yalnız iOS + destekleyen cihaz).
 */
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Apple ile giriş; backend'e gönderilecek identityToken (+ ilk seferde fullName) döner.
 * Kullanıcı iptal ederse ERR_REQUEST_CANCELED fırlatır (çağıran sessiz geçer).
 */
export async function signInWithApple(): Promise<{ identityToken: string; fullName?: string }> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const identityToken = credential.identityToken;
  if (!identityToken) throw new Error('Apple identityToken alınamadı');
  const parts = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean);
  const fullName = parts.length ? parts.join(' ') : undefined;
  return { identityToken, fullName };
}
