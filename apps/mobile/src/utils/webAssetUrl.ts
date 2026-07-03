import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Web `public/` dosyaları (örn. /photos/logolar/...) için tam URL.
 * API :3001, Next.js genelde :3000 üzerinde.
 */
export function getWebPublicAssetUrl(path: string): string {
  if (!path || typeof path !== 'string') return '';
  const p = path.trim();
  if (p.startsWith('http://') || p.startsWith('https://')) return p;

  const normalized = p.startsWith('/') ? p : `/${p}`;

  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (webUrl) return `${webUrl.replace(/\/+$/, '')}${normalized}`;
  // Standalone/production: hostUri undefined → localhost DEĞİL, prod web host kullan.
  if (process.env.EXPO_PUBLIC_ENVIRONMENT && process.env.EXPO_PUBLIC_ENVIRONMENT !== 'development') {
    return `https://tarodan.shop${normalized}`;
  }

  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (expoHost) {
    return `http://${expoHost}:3000${normalized}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:3000${normalized}`;
  }
  return `http://localhost:3000${normalized}`;
}
