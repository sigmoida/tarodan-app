/**
 * Görsel URL çözümleme — mobil uygulamanın TEK kaynağı.
 *
 * Sorun: API farklı endpoint'lerde görseli farklı şekillerde döndürüyor:
 *   - ürün görselleri:      { cardUrl, detailUrl, cardKey, detailKey }
 *   - koleksiyon kapağı:    coverImageUrl
 *   - avatar / logo:        avatarUrl / logo / image
 *   - bazen düz string (tam URL), bazen dizi, bazen çıplak S3 key.
 * React Native <Image> ise MUTLAK bir uri ister; yanlış/eksik alan → boş görsel.
 *
 * Çözüm: `resolveImageUrl(input)` her şekli (string | object | array | null)
 * kabul eder, doğru alanı fallback zinciriyle seçer, lokal (file/ph/content)
 * URI'leri olduğu gibi geçirir, çıplak key / relatif yolu mutlak URL'ye çevirir,
 * hiçbiri yoksa placeholder döner. `transformImageUrl` ve `getImageUrl` geriye
 * dönük uyumluluk için bu fonksiyona delege eder — mevcut çağrı yerleri
 * dokunulmadan sağlamlaşır.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const IMAGE_PLACEHOLDER = 'https://placehold.co/400x300/f3f4f6/9ca3af?text=G%C3%B6rsel';

// React Native'in doğrudan render edebildiği lokal/uzak şemalar.
const REMOTE_URI_RE = /^https?:\/\//i;
const LOCAL_URI_RE = /^(file|content|ph|assets-library|data|blob):/i;

// Çıplak S3 key'lerini (örn. "dev/products/abc.jpg") çözmek için opsiyonel taban.
const S3_PUBLIC_BASE = (process.env.EXPO_PUBLIC_S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

/**
 * Web `public/` (örn. "/photos/...") relatif yolları için host.
 * API :3001, Next.js public assets :3000.
 */
function webAssetHost(): string {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (webUrl) return webUrl.replace(/\/+$/, '');
  // Standalone/production: hostUri undefined → localhost DEĞİL, prod web host kullan.
  if (process.env.EXPO_PUBLIC_ENVIRONMENT && process.env.EXPO_PUBLIC_ENVIRONMENT !== 'development') {
    return 'https://tarodan.shop';
  }
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (expoHost) return `http://${expoHost}:3000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

// Bir nesne verildiğinde görsel alanını seçme önceliği.
const IMAGE_FIELDS = [
  'detailUrl',
  'cardUrl',
  'coverImageUrl',
  'imageUrl',
  'avatarUrl',
  'logoUrl',
  'productImage',
  'url',
  'image',
  'logo',
  'coverImage',
  'avatar',
  'src',
] as const;

function pickFromObject(obj: Record<string, unknown>): unknown {
  // Bir entity (ürün/ilan) ise önce images dizisinin ilk elemanı.
  const images = obj.images;
  if (Array.isArray(images) && images.length > 0) return images[0];

  for (const field of IMAGE_FIELDS) {
    const value = obj[field];
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object') return value; // iç içe görsel objesi
  }
  return undefined;
}

/**
 * Her şekildeki görsel girdisini render edilebilir mutlak bir uri'ye çevirir.
 * Geçersiz/boş ise placeholder döner (asla undefined döndürmez).
 */
export function resolveImageUrl(input: unknown): string {
  if (input == null) return IMAGE_PLACEHOLDER;

  if (Array.isArray(input)) {
    return input.length > 0 ? resolveImageUrl(input[0]) : IMAGE_PLACEHOLDER;
  }

  if (typeof input === 'object') {
    const picked = pickFromObject(input as Record<string, unknown>);
    return picked === undefined ? IMAGE_PLACEHOLDER : resolveImageUrl(picked);
  }

  if (typeof input !== 'string') return IMAGE_PLACEHOLDER;

  const s = input.trim();
  if (!s) return IMAGE_PLACEHOLDER;

  // Zaten render edilebilir (uzak veya lokal cihaz) URI.
  if (REMOTE_URI_RE.test(s) || LOCAL_URI_RE.test(s)) return s;

  // Web public relatif yolu (örn. "/photos/logolar/x.png").
  if (s.startsWith('/')) return `${webAssetHost()}${s}`;

  // Çıplak S3 key — env tanımlıysa mutlak URL'ye çevir.
  if (S3_PUBLIC_BASE) return `${S3_PUBLIC_BASE}/${s.replace(/^\/+/, '')}`;

  // Çözülemeyen değer (örn. presigning yapılmamış key, env yok) → placeholder.
  return IMAGE_PLACEHOLDER;
}

/**
 * Avatar/profil görseli için kaynak çözücü. `resolveImageUrl`'den farkı:
 * değer yok ya da çözülemiyorsa placeholder yerine `undefined` döner — böylece
 * <Avatar> genel placeholder görseli yerine baş harf fallback'ini gösterir.
 */
export function resolveAvatarSource(input: unknown): string | undefined {
  if (input == null || (typeof input === 'string' && !input.trim())) return undefined;
  const resolved = resolveImageUrl(input);
  return resolved === IMAGE_PLACEHOLDER ? undefined : resolved;
}

/**
 * Geriye dönük uyumlu alias'lar. Mevcut çağrılar otomatik sağlamlaşır.
 * @deprecated Yeni kodda `resolveImageUrl` kullanın.
 */
export const transformImageUrl = (url: unknown): string => resolveImageUrl(url);

/**
 * Geriye dönük uyumlu alias — dizi/obje/string hepsini kabul eder.
 * @deprecated Yeni kodda `resolveImageUrl` kullanın.
 */
export const getImageUrl = (images: unknown): string => resolveImageUrl(images);
