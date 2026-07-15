/**
 * Sentry sarmalayıcısı (mobil) — gerçek @sentry/react-native.
 * Expo Go'da native module yüklenemez; runtime guard ile no-op kalır.
 * DSN yoksa da no-op.
 */
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

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

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const enabled = !isExpoGo && Boolean(dsn);

let initialized = false;

/**
 * Uygulama açılışında bir kere çağrılır (App.tsx / _layout.tsx içinden).
 * Expo Go'da veya DSN yoksa no-op.
 */
export function initSentry(): void {
  if (!enabled || initialized) return;
  initialized = true;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,
    enableNative: true,
  });
}

/**
 * Yakalanmış bir exception'ı Sentry'ye gönderir.
 * Hiçbir şart sağlanmazsa konsola yazar, hata fırlatmaz.
 */
export function captureException(error: unknown, options: CaptureOptions = {}): void {
  if (!enabled) {
    if (__DEV__) console.warn('[sentry] captureException (disabled):', error, options);
    return;
  }
  Sentry.withScope((scope) => {
    if (options.level) scope.setLevel(options.level);
    if (options.tags) Object.entries(options.tags).forEach(([k, v]) => scope.setTag(k, v));
    if (options.extra) Object.entries(options.extra).forEach(([k, v]) => scope.setExtra(k, v));
    if (options.user) scope.setUser(options.user);
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: SeverityLevel = 'info'): void {
  if (!enabled) {
    if (__DEV__) console.log('[sentry] captureMessage (disabled):', message, level);
    return;
  }
  Sentry.captureMessage(message, level);
}

export function setUser(user: SentryUser | null): void {
  if (!enabled) return;
  Sentry.setUser(user);
}

/**
 * Performans iz kaydı: bir async işlemi sar, ne kadar sürdüğü Sentry'ye
 * raporlanır. Guard kapalıyken sadece fn'i çalıştırır.
 */
export async function withTransaction<T>(
  name: string,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled) return fn();
  return Sentry.startSpan({ name, op }, () => fn());
}
