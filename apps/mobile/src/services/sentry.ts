/**
 * Sentry sarmalayıcısı (mobil).
 *
 * Tasarım kararı: `@sentry/react-native` native module — Expo Go'da
 * yüklenemez. Bu modül "stub" olarak yazıldı: paket eklenmediği sürece
 * tüm Sentry çağrıları no-op'tur, geliştirici ortamı bozulmaz.
 *
 * Üretim paketleme zamanında yapılacak değişiklik:
 *   1. `npx expo install @sentry/react-native`
 *   2. `app.json`'a plugin: ["@sentry/react-native/expo"]
 *   3. Aşağıdaki SENTRY_PACKAGE_LOADED bayrağını true yap ve içindeki
 *      `// import * as Sentry from '@sentry/react-native'` satırını
 *      uncomment et.
 *   4. EXPO_PUBLIC_SENTRY_DSN env'i ekle.
 *
 * Hiçbir çağıran kod (App.tsx, error boundary, manuel captureException
 * çağrıları) o gün değiştirilmez — bu modül arkadan çalışır.
 */

import Constants from 'expo-constants';

// ─── Aktivasyon bayrağı ──────────────────────────────────────────────
// Paketleme zamanında: SENTRY_PACKAGE_LOADED = true + alttaki import açılır.
const SENTRY_PACKAGE_LOADED = false;

// import * as Sentry from '@sentry/react-native';   // ← paketleme zamanında uncomment

// ─── Tipler (gerçek paketin sağladıklarına yakın) ────────────────────
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface SentryUser {
  id?: string;
  email?: string;
  username?: string;
}

interface CaptureOptions {
  level?: SeverityLevel;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: SentryUser;
}

// ─── Çalışma zamanı durumu ───────────────────────────────────────────
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const enabled = SENTRY_PACKAGE_LOADED && !isExpoGo && Boolean(dsn);

let initialized = false;

/**
 * Uygulama açılışında bir kere çağrılır (App.tsx içinden).
 * Expo Go'da, DSN yoksa veya paket yüklü değilse no-op.
 */
export function initSentry(): void {
  if (!enabled || initialized) return;
  initialized = true;
  // Paketleme zamanında uncomment:
  // Sentry.init({
  //   dsn,
  //   environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
  //   tracesSampleRate: 0.1,
  //   enableNative: true,
  // });
  console.log('[sentry] initialized (stub)');
}

/**
 * Yakalanmış bir exception'ı Sentry'ye gönderir.
 * Hiçbir şart sağlanmazsa konsola yazar, hata fırlatmaz.
 */
export function captureException(
  error: unknown,
  options: CaptureOptions = {},
): void {
  if (!enabled) {
    if (__DEV__) console.warn('[sentry stub] captureException:', error, options);
    return;
  }
  // Paketleme zamanında uncomment:
  // Sentry.withScope((scope) => {
  //   if (options.level) scope.setLevel(options.level);
  //   if (options.tags) Object.entries(options.tags).forEach(([k, v]) => scope.setTag(k, v));
  //   if (options.extra) Object.entries(options.extra).forEach(([k, v]) => scope.setExtra(k, v));
  //   if (options.user) scope.setUser(options.user);
  //   Sentry.captureException(error);
  // });
}

export function captureMessage(message: string, level: SeverityLevel = 'info'): void {
  if (!enabled) {
    if (__DEV__) console.log('[sentry stub] captureMessage:', message, level);
    return;
  }
  // Sentry.captureMessage(message, level);
}

export function setUser(user: SentryUser | null): void {
  if (!enabled) return;
  // Sentry.setUser(user);
}

/**
 * Performans iz kaydı: bir async işlemi sar, ne kadar sürdüğü Sentry'ye
 * raporlanır. Şu an stub — paketleme zamanında transaction wrap eder.
 */
export async function withTransaction<T>(
  _name: string,
  _op: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Paketleme zamanında: Sentry.startTransaction({ name, op }) ile sar.
  return fn();
}
