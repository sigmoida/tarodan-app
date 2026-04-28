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
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (expoHost) {
    return `http://${expoHost}:3000${normalized}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:3000${normalized}`;
  }
  return `http://localhost:3000${normalized}`;
}
