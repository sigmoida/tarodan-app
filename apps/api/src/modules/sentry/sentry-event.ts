import type { Event } from "@sentry/node";
import { getRequestId } from "../../common/context/request-context";
import { redactSensitive } from "../../common/security/redact-sensitive";

/**
 * Sentry'ye giden her olayın geçtiği tek kapı (Sentry.init → beforeSend).
 *
 * Korelasyon kimliği `extra` değil TAG olarak eklenir: extra alanları
 * aranamaz, oysa asıl senaryo kullanıcının destek talebinde verdiği kodu
 * Sentry arama çubuğuna `requestId:...` diye yazmaktır.
 */
export function applySentryEventPolicy<T extends Event>(event: T): T | null {
  // Sağlık kontrolleri dakikada bir koşar; issue listesini boğar.
  if (event.request?.url?.includes("/health")) return null;

  const requestId = getRequestId();
  if (requestId) {
    event.tags = { ...event.tags, requestId };
  }

  return redactSensitive(event) as T;
}

/**
 * Dağıtım sürümü. Sırayla: açıkça verilen `SENTRY_RELEASE`, Coolify'ın
 * `SOURCE_COMMIT`'i, genel `GIT_COMMIT_SHA`. Hiçbiri yoksa undefined döner ve
 * Sentry kendi tahminine düşer (Docker imajında .git bulunmadığı için
 * genellikle tahmin edemez — o durumda sürüm etiketsiz kalır, akış bozulmaz).
 */
export function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env.SENTRY_RELEASE?.trim();
  if (explicit) return explicit;

  const sha = (env.SOURCE_COMMIT ?? env.GIT_COMMIT_SHA)?.trim();
  return sha ? sha.slice(0, 7) : undefined;
}
